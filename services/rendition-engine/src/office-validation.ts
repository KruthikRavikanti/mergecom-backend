import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { XMLParser } from 'fast-xml-parser';

const MAX_ENTRIES = 20_000;
const MAX_RELATIONSHIPS_BYTES = 2 * 1024 * 1024;
const relationshipsParser = new XMLParser({
  ignoreAttributes: false,
  ignoreDeclaration: true,
  processEntities: false,
});
const REQUIRED_PART: Record<string, string> = {
  '.docx': 'word/document.xml',
  '.pptx': 'ppt/presentation.xml',
  '.xlsx': 'xl/workbook.xml',
};

export class OfficePackageValidationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
  }
}

export async function validateOfficePackage(
  bytes: Uint8Array,
  extension: string,
  maxExpandedBytes: number,
): Promise<void> {
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    !(
      (bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06)
    )
  ) {
    throw new OfficePackageValidationError('invalid_office_package');
  }
  const requiredPart = REQUIRED_PART[extension];
  if (!requiredPart) {
    throw new OfficePackageValidationError('unsupported_office_format');
  }
  const entries = await readEntries(Buffer.from(bytes), maxExpandedBytes);
  if (
    !entries.has('[content_types].xml') ||
    !entries.has('_rels/.rels') ||
    !entries.has(requiredPart)
  ) {
    throw new OfficePackageValidationError('invalid_office_package');
  }
}

function readEntries(
  bytes: Buffer,
  maxExpandedBytes: number,
): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true },
      (openError, zipFile) => {
        if (openError) {
          reject(new OfficePackageValidationError('invalid_office_package'));
          return;
        }
        inspectEntries(zipFile, maxExpandedBytes, resolve, reject);
      },
    );
  });
}

function inspectEntries(
  zipFile: ZipFile,
  maxExpandedBytes: number,
  resolve: (entries: Set<string>) => void,
  reject: (error: Error) => void,
): void {
  const names = new Set<string>();
  let expandedBytes = 0;
  let settled = false;
  const fail = (code: string) => {
    if (settled) return;
    settled = true;
    zipFile.close();
    reject(new OfficePackageValidationError(code));
  };
  if (zipFile.entryCount > MAX_ENTRIES) {
    fail('office_package_limit_exceeded');
    return;
  }
  zipFile.on('error', () => fail('invalid_office_package'));
  zipFile.on('entry', (entry: Entry) => {
    if (settled) return;
    const name = entry.fileName.replace(/\\/gu, '/').toLowerCase();
    let decodedName: string;
    try {
      decodedName = decodeURIComponent(name).replace(/\\/gu, '/');
    } catch {
      fail('invalid_office_package');
      return;
    }
    if (
      decodedName.startsWith('/') ||
      decodedName.split('/').includes('..') ||
      decodedName.includes('\0')
    ) {
      fail('invalid_office_package');
      return;
    }
    if (entry.isEncrypted()) {
      fail('encrypted_office_package');
      return;
    }
    if (name.endsWith('/vbaproject.bin')) {
      fail('macro_enabled_package');
      return;
    }
    expandedBytes += entry.uncompressedSize;
    if (
      !Number.isSafeInteger(expandedBytes) ||
      expandedBytes > maxExpandedBytes
    ) {
      fail('office_package_limit_exceeded');
      return;
    }
    names.add(decodedName);
    if (decodedName.endsWith('.rels')) {
      void relationshipIsExternal(zipFile, entry)
        .then((external) => {
          if (settled) return;
          if (external) {
            fail('external_relationships_not_allowed');
            return;
          }
          zipFile.readEntry();
        })
        .catch(() => fail('invalid_office_package'));
      return;
    }
    zipFile.readEntry();
  });
  zipFile.on('end', () => {
    if (settled) return;
    settled = true;
    resolve(names);
  });
  zipFile.readEntry();
}

function relationshipIsExternal(
  zipFile: ZipFile,
  entry: Entry,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (openError, stream) => {
      if (openError || !stream) {
        reject(openError ?? new Error('Relationship stream is unavailable.'));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on('data', (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > MAX_RELATIONSHIPS_BYTES) {
          stream.destroy(
            new OfficePackageValidationError('office_package_limit_exceeded'),
          );
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => {
        try {
          resolve(
            hasExternalTarget(relationshipsParser.parse(Buffer.concat(chunks))),
          );
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('Relationship XML could not be parsed.'),
          );
        }
      });
    });
  });
}

function hasExternalTarget(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasExternalTarget);
  if (typeof value !== 'object' || value === null) return false;
  for (const [key, candidate] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      normalized.endsWith('targetmode') &&
      typeof candidate === 'string' &&
      candidate.toLowerCase() === 'external'
    ) {
      return true;
    }
    if (
      normalized.endsWith('target') &&
      typeof candidate === 'string' &&
      (/^[a-z][a-z0-9+.-]*:/iu.test(candidate) ||
        candidate.startsWith('//') ||
        candidate.startsWith('\\\\'))
    ) {
      return true;
    }
    if (hasExternalTarget(candidate)) return true;
  }
  return false;
}
