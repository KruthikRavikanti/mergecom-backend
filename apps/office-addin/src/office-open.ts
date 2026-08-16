import type { OfficeHost } from '@mergecom/office-core';

export const MAX_OFFICE_OPEN_BYTES = 50 * 1024 * 1024;

export type ExactOpenSupport =
  { supported: true } | { reason: string; supported: false };

export interface OfficeOpenApplications {
  Excel?: {
    createWorkbook(base64: string): Promise<void>;
  };
  PowerPoint?: {
    createPresentation(base64: string): Promise<void>;
  };
  Word?: {
    run(
      batch: (context: {
        application: {
          createDocument(base64: string): { open(): void };
        };
        sync(): Promise<void>;
      }) => Promise<void>,
    ): Promise<void>;
  };
}

const OPEN_EXTENSION_BY_HOST: Readonly<Record<OfficeHost, string>> = {
  excel: '.xlsx',
  powerpoint: '.pptx',
  word: '.docx',
};

export function getExactOpenSupport(
  host: OfficeHost,
  fileName: string,
  byteSize: number,
  requirementSupported: boolean,
  applicationAvailable: boolean,
): ExactOpenSupport {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    return {
      reason: 'This version has an invalid package size.',
      supported: false,
    };
  }
  if (extension(fileName) !== OPEN_EXTENSION_BY_HOST[host]) {
    return {
      reason:
        'Macro-enabled Office packages can be downloaded but not opened automatically.',
      supported: false,
    };
  }
  if (byteSize > MAX_OFFICE_OPEN_BYTES) {
    return {
      reason: `Packages larger than ${MAX_OFFICE_OPEN_BYTES / 1024 / 1024} MB must be downloaded.`,
      supported: false,
    };
  }
  if (!requirementSupported || !applicationAvailable) {
    return {
      reason: `This ${hostLabel(host)} runtime cannot open a separate package copy.`,
      supported: false,
    };
  }
  return { supported: true };
}

export async function openExactOfficePackage(
  host: OfficeHost,
  bytes: Uint8Array,
  applications: OfficeOpenApplications = getGlobalApplications(),
): Promise<void> {
  if (host === 'excel' && applications.Excel) {
    await applications.Excel.createWorkbook(encodeBase64(bytes));
    return;
  }
  if (host === 'powerpoint' && applications.PowerPoint) {
    await applications.PowerPoint.createPresentation(encodeBase64(bytes));
    return;
  }
  if (host === 'word' && applications.Word) {
    const base64 = encodeBase64(bytes);
    await applications.Word.run(async (context) => {
      const document = context.application.createDocument(base64);
      await context.sync();
      document.open();
      await context.sync();
    });
    return;
  }
  throw new Error(
    `This ${hostLabel(host)} runtime cannot open a separate package copy.`,
  );
}

export function getGlobalApplications(): OfficeOpenApplications {
  const globals = globalThis as unknown as OfficeOpenApplications;
  return {
    ...(globals.Excel ? { Excel: globals.Excel } : {}),
    ...(globals.PowerPoint ? { PowerPoint: globals.PowerPoint } : {}),
    ...(globals.Word ? { Word: globals.Word } : {}),
  };
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    );
  }
  return btoa(chunks.join(''));
}

function extension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  return dotIndex >= 0 ? normalized.slice(dotIndex) : '';
}

function hostLabel(host: OfficeHost): string {
  return `${host.charAt(0).toUpperCase()}${host.slice(1)}`;
}
