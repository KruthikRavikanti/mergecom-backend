export type OfficeHost = 'excel' | 'powerpoint' | 'word';

export type OfficePlatform =
  'android' | 'ios' | 'mac' | 'office-online' | 'pc' | 'universal' | 'unknown';

export type ExactCaptureUnsupportedCode =
  | 'compressed-file-unavailable'
  | 'package-integrity-unsupported'
  | 'platform-unsupported';

export type ExactCaptureSupport =
  | { supported: true }
  | {
      code: ExactCaptureUnsupportedCode;
      reason: string;
      supported: false;
    };

export interface OfficeArtifactDescriptor {
  contentLength: number;
  fileName: string;
  mediaType: string;
  sha256: string;
  sourceHost: OfficeHost;
}

export interface OfficeFileSlice {
  data: ArrayBuffer | ArrayBufferView | ArrayLike<number>;
  index: number;
}

export interface OfficeCompressedFile {
  close: () => Promise<void>;
  getSlice: (index: number) => Promise<OfficeFileSlice>;
  size: number;
  sliceCount: number;
}

export interface OfficeCompressedFileProvider {
  openCompressedFile: (sliceSize: number) => Promise<OfficeCompressedFile>;
}

export interface ExactCaptureProgress {
  bytesCaptured: number;
  sliceCount: number;
  slicesCaptured: number;
  totalBytes: number;
}

export interface CaptureExactOfficePackageOptions {
  fileName: string;
  host: OfficeHost;
  maxBytes?: number;
  onProgress?: (progress: ExactCaptureProgress) => void;
  signal?: AbortSignal;
  sliceSize?: number;
}

export interface CapturedOfficePackage {
  bytes: Uint8Array;
  descriptor: OfficeArtifactDescriptor;
}

export const DEFAULT_MAX_OFFICE_PACKAGE_BYTES = 100 * 1024 * 1024;
export const DEFAULT_OFFICE_SLICE_BYTES = 4 * 1024 * 1024;

const MAX_SLICE_COUNT = 1_000_000;

const EXTENSIONS_BY_HOST: Readonly<Record<OfficeHost, readonly string[]>> = {
  excel: ['.xlsx', '.xlsm'],
  powerpoint: ['.pptx', '.pptm'],
  word: ['.docx', '.docm'],
};

const MEDIA_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.docm': 'application/vnd.ms-word.document.macroEnabled.12',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptm': 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const SUPPORTED_PLATFORMS: Readonly<
  Record<OfficeHost, ReadonlySet<OfficePlatform>>
> = {
  excel: new Set(['mac', 'pc']),
  powerpoint: new Set(['ios', 'mac', 'office-online', 'pc']),
  word: new Set(['ios', 'mac', 'pc']),
};

export function getExactCaptureSupport(
  host: OfficeHost,
  platform: OfficePlatform,
  compressedFileAvailable: boolean,
  fileName?: string | null,
): ExactCaptureSupport {
  if (!compressedFileAvailable) {
    return {
      code: 'compressed-file-unavailable',
      reason: 'This Office runtime does not provide compressed file access.',
      supported: false,
    };
  }

  if (!SUPPORTED_PLATFORMS[host].has(platform)) {
    return {
      code: 'platform-unsupported',
      reason: `Exact ${host} package capture is not supported on ${platform}.`,
      supported: false,
    };
  }

  if (
    host === 'excel' &&
    platform === 'mac' &&
    fileName?.trim().toLowerCase().endsWith('.xlsm') === true
  ) {
    return {
      code: 'package-integrity-unsupported',
      reason:
        'Excel on Mac omits VBA signature parts from compressed .xlsm files.',
      supported: false,
    };
  }

  return { supported: true };
}

export function assertOfficeArtifact(
  descriptor: OfficeArtifactDescriptor,
): void {
  if (!Number.isSafeInteger(descriptor.contentLength))
    throw new Error('Office artifact length must be a safe integer.');
  if (descriptor.contentLength <= 0)
    throw new Error('Office artifacts cannot be empty.');
  if (!/^[a-f0-9]{64}$/u.test(descriptor.sha256))
    throw new Error('Artifact SHA-256 must be lowercase hex.');
  if (!descriptor.mediaType.startsWith('application/'))
    throw new Error('Artifact media type must be an application type.');

  const extension = getExtension(descriptor.fileName);
  if (!EXTENSIONS_BY_HOST[descriptor.sourceHost].includes(extension)) {
    throw new Error(
      `${descriptor.fileName} is not valid for the ${descriptor.sourceHost} host.`,
    );
  }
  if (MEDIA_TYPE_BY_EXTENSION[extension] !== descriptor.mediaType) {
    throw new Error('Artifact media type does not match its file extension.');
  }
}

export async function captureExactOfficePackage(
  provider: OfficeCompressedFileProvider,
  options: CaptureExactOfficePackageOptions,
): Promise<CapturedOfficePackage> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_OFFICE_PACKAGE_BYTES;
  const sliceSize = options.sliceSize ?? DEFAULT_OFFICE_SLICE_BYTES;
  assertPositiveSafeInteger(maxBytes, 'Maximum package size');
  assertPositiveSafeInteger(sliceSize, 'Slice size');
  throwIfAborted(options.signal);

  const extension = getExtension(options.fileName);
  if (!EXTENSIONS_BY_HOST[options.host].includes(extension)) {
    throw new Error(
      `${options.fileName} is not valid for the ${options.host} host.`,
    );
  }

  const file = await provider.openCompressedFile(sliceSize);
  let captureError: unknown;
  let captureFailed = false;
  let capturedPackage: CapturedOfficePackage | undefined;

  try {
    assertPositiveSafeInteger(file.size, 'Office file size');
    assertPositiveSafeInteger(file.sliceCount, 'Office slice count');
    if (file.sliceCount > MAX_SLICE_COUNT) {
      throw new Error('Office slice count exceeds the capture limit.');
    }
    if (file.size > maxBytes) {
      throw new Error(
        `Office package is ${file.size} bytes; the capture limit is ${maxBytes} bytes.`,
      );
    }

    const bytes = new Uint8Array(file.size);
    let offset = 0;

    for (let index = 0; index < file.sliceCount; index += 1) {
      throwIfAborted(options.signal);
      const slice = await file.getSlice(index);
      throwIfAborted(options.signal);
      if (slice.index !== index) {
        throw new Error(
          `Office returned slice ${slice.index}; expected slice ${index}.`,
        );
      }

      const sliceBytes = toUint8Array(slice.data, file.size - offset);
      if (sliceBytes.byteLength === 0) {
        throw new Error(`Office returned an empty slice at index ${index}.`);
      }
      if (offset + sliceBytes.byteLength > file.size) {
        throw new Error('Office slices exceed the declared file size.');
      }

      bytes.set(sliceBytes, offset);
      offset += sliceBytes.byteLength;
      options.onProgress?.({
        bytesCaptured: offset,
        sliceCount: file.sliceCount,
        slicesCaptured: index + 1,
        totalBytes: file.size,
      });
    }

    if (offset !== file.size) {
      throw new Error(
        `Office slices contain ${offset} bytes; expected ${file.size} bytes.`,
      );
    }
    if (!isZipPackage(bytes)) {
      throw new Error('Office returned data that is not an OOXML ZIP package.');
    }

    const descriptor: OfficeArtifactDescriptor = {
      contentLength: bytes.byteLength,
      fileName: options.fileName,
      mediaType: MEDIA_TYPE_BY_EXTENSION[extension] ?? '',
      sha256: await sha256Hex(bytes),
      sourceHost: options.host,
    };
    assertOfficeArtifact(descriptor);
    capturedPackage = { bytes, descriptor };
  } catch (error) {
    captureFailed = true;
    captureError = error;
  }

  try {
    await file.close();
  } catch (closeError) {
    if (!captureFailed) {
      captureFailed = true;
      captureError = closeError;
    }
  }

  if (captureFailed) throw captureError;
  if (capturedPackage === undefined) {
    throw new Error('Office package capture completed without a result.');
  }
  return capturedPackage;
}

export async function verifyExactOfficePackage(
  bytes: Uint8Array,
  descriptor: OfficeArtifactDescriptor,
): Promise<void> {
  assertOfficeArtifact(descriptor);
  if (bytes.byteLength !== descriptor.contentLength) {
    throw new Error(
      `Downloaded Office package contains ${bytes.byteLength} bytes; expected ${descriptor.contentLength} bytes.`,
    );
  }
  if (!isZipPackage(bytes)) {
    throw new Error('Downloaded data is not an OOXML ZIP package.');
  }
  if ((await sha256Hex(bytes)) !== descriptor.sha256) {
    throw new Error('Downloaded Office package SHA-256 does not match.');
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function getExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  return dotIndex >= 0 ? normalized.slice(dotIndex) : '';
}

function isZipPackage(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes).buffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', digestInput);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}

function toUint8Array(
  data: ArrayBuffer | ArrayBufferView | ArrayLike<number>,
  remainingBytes: number,
): Uint8Array {
  if (data instanceof ArrayBuffer) {
    assertSliceFits(data.byteLength, remainingBytes);
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    assertSliceFits(data.byteLength, remainingBytes);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  assertSliceFits(data.length, remainingBytes);
  const bytes = new Uint8Array(data.length);
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 255
    ) {
      throw new Error(
        `Office slice contains an invalid byte at index ${index}.`,
      );
    }
    bytes[index] = value;
  }
  return bytes;
}

function assertSliceFits(length: number, remainingBytes: number): void {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new Error('Office slice length must be a non-negative safe integer.');
  }
  if (length > remainingBytes) {
    throw new Error('Office slices exceed the declared file size.');
  }
}
