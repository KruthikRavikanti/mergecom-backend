import type {
  OfficeCompressedFile,
  OfficeCompressedFileProvider,
  OfficeHost,
  OfficePlatform,
} from '@mergecom/office-core';

type OfficeToken = number | string;

interface OfficeErrorLike {
  message?: string;
}

interface OfficeAsyncResult<T> {
  error?: OfficeErrorLike;
  status: OfficeToken;
  value: T;
}

interface OfficeSliceLike {
  data: unknown;
  index: number;
}

interface OfficeFileLike {
  closeAsync(callback: (result: OfficeAsyncResult<void>) => void): void;
  getSliceAsync(
    index: number,
    callback: (result: OfficeAsyncResult<OfficeSliceLike>) => void,
  ): void;
  size: number;
  sliceCount: number;
}

interface OfficeDocumentLike {
  getFileAsync(
    fileType: OfficeToken,
    options: { sliceSize: number },
    callback: (result: OfficeAsyncResult<OfficeFileLike>) => void,
  ): void;
  url: string | null;
}

interface OfficeApi {
  AsyncResultStatus: { Succeeded: OfficeToken };
  FileType: { Compressed: OfficeToken };
  HostType: {
    Excel: OfficeToken;
    PowerPoint: OfficeToken;
    Word: OfficeToken;
  };
  PlatformType: {
    Android: OfficeToken;
    Mac: OfficeToken;
    OfficeOnline: OfficeToken;
    PC: OfficeToken;
    Universal: OfficeToken;
    iOS: OfficeToken;
  };
  context: {
    document: OfficeDocumentLike;
    requirements: {
      isSetSupported(name: string, minimumVersion: string): boolean;
    };
  };
  onReady(): Promise<{
    host: OfficeToken | null;
    platform: OfficeToken | null;
  } | null>;
}

export interface OfficeRuntime {
  compressedFileAvailable: boolean;
  fileName: string | null;
  host: OfficeHost;
  platform: OfficePlatform;
  provider: OfficeCompressedFileProvider;
}

const EXTENSIONS_BY_HOST: Readonly<Record<OfficeHost, readonly string[]>> = {
  excel: ['.xlsx', '.xlsm'],
  powerpoint: ['.pptx', '.pptm'],
  word: ['.docx', '.docm'],
};

export async function detectOfficeRuntime(
  providedOffice?: OfficeApi,
): Promise<OfficeRuntime | null> {
  const office = providedOffice ?? getGlobalOfficeApi();
  if (office === undefined) return null;

  const ready = await office.onReady();
  const host = mapHost(office, ready?.host);
  if (host === null) return null;

  const platform = mapPlatform(office, ready?.platform);
  const compressedFileAvailable = office.context.requirements.isSetSupported(
    'CompressedFile',
    '1.1',
  );

  return {
    compressedFileAvailable,
    fileName: getSavedFileName(office.context.document.url, host),
    host,
    platform,
    provider: createCompressedFileProvider(office),
  };
}

export function getOfficeSliceSize(platform: OfficePlatform): number {
  return platform === 'ios' ? 64 * 1024 : 4 * 1024 * 1024;
}

function createCompressedFileProvider(
  office: OfficeApi,
): OfficeCompressedFileProvider {
  return {
    openCompressedFile: (sliceSize) =>
      new Promise<OfficeCompressedFile>((resolve, reject) => {
        office.context.document.getFileAsync(
          office.FileType.Compressed,
          { sliceSize },
          (result) => {
            if (result.status !== office.AsyncResultStatus.Succeeded) {
              reject(
                toOfficeError('Open compressed Office file', result.error),
              );
              return;
            }
            resolve(wrapOfficeFile(office, result.value));
          },
        );
      }),
  };
}

function wrapOfficeFile(
  office: OfficeApi,
  file: OfficeFileLike,
): OfficeCompressedFile {
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        file.closeAsync((result) => {
          if (result.status === office.AsyncResultStatus.Succeeded) {
            resolve();
            return;
          }
          reject(toOfficeError('Close Office file', result.error));
        });
      }),
    getSlice: (index) =>
      new Promise((resolve, reject) => {
        file.getSliceAsync(index, (result) => {
          if (result.status !== office.AsyncResultStatus.Succeeded) {
            reject(
              toOfficeError(`Read Office file slice ${index}`, result.error),
            );
            return;
          }

          try {
            resolve({
              data: normalizeSliceData(result.value.data),
              index: result.value.index,
            });
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error('Office returned invalid slice data.'),
            );
          }
        });
      }),
    size: file.size,
    sliceCount: file.sliceCount,
  };
}

function normalizeSliceData(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (
    Array.isArray(data) &&
    data.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
  ) {
    return Uint8Array.from(data as number[]);
  }
  throw new Error('Office returned a slice with invalid binary data.');
}

function mapHost(
  office: OfficeApi,
  host: OfficeToken | null | undefined,
): OfficeHost | null {
  if (host === office.HostType.Excel) return 'excel';
  if (host === office.HostType.PowerPoint) return 'powerpoint';
  if (host === office.HostType.Word) return 'word';
  return null;
}

function mapPlatform(
  office: OfficeApi,
  platform: OfficeToken | null | undefined,
): OfficePlatform {
  if (platform === office.PlatformType.Android) return 'android';
  if (platform === office.PlatformType.iOS) return 'ios';
  if (platform === office.PlatformType.Mac) return 'mac';
  if (platform === office.PlatformType.OfficeOnline) return 'office-online';
  if (platform === office.PlatformType.PC) return 'pc';
  if (platform === office.PlatformType.Universal) return 'universal';
  return 'unknown';
}

function getSavedFileName(url: string | null, host: OfficeHost): string | null {
  if (url === null || url.trim() === '') return null;

  const withoutQuery = url.split(/[?#]/u, 1)[0] ?? '';
  const pathParts = withoutQuery.replaceAll('\\', '/').split('/');
  const encodedName = pathParts.at(-1) ?? '';
  let fileName: string;
  try {
    fileName = decodeURIComponent(encodedName);
  } catch {
    return null;
  }

  const lowerName = fileName.toLowerCase();
  return EXTENSIONS_BY_HOST[host].some((extension) =>
    lowerName.endsWith(extension),
  )
    ? fileName
    : null;
}

function getGlobalOfficeApi(): OfficeApi | undefined {
  const office = (globalThis as { Office?: unknown }).Office;
  return office === undefined ? undefined : (office as OfficeApi);
}

function toOfficeError(
  action: string,
  error: OfficeErrorLike | undefined,
): Error {
  return new Error(
    `${action} failed: ${error?.message ?? 'Office returned an error.'}`,
  );
}
