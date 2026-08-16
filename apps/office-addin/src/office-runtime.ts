import type {
  OfficeCompressedFile,
  OfficeCompressedFileProvider,
  OfficeHost,
  OfficePlatform,
} from '@mergecom/office-core';

import {
  DOCUMENT_BINDING_SETTING,
  type DocumentBindingStore,
  parseDocumentBinding,
} from './document-binding';

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

interface OfficeDialogLike {
  addEventHandler(
    eventType: OfficeToken,
    handler: (event: { error?: number; message?: string }) => void,
  ): void;
  close(): void;
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
  getFilePropertiesAsync?(
    callback: (result: OfficeAsyncResult<{ url: string }>) => void,
  ): void;
  getFileAsync(
    fileType: OfficeToken,
    options: { sliceSize: number },
    callback: (result: OfficeAsyncResult<OfficeFileLike>) => void,
  ): void;
  settings: {
    get(name: string): unknown;
    remove(name: string): void;
    saveAsync(callback: (result: OfficeAsyncResult<void>) => void): void;
    set(name: string, value: unknown): void;
  };
  url: string | null;
}

interface OfficeApi {
  AsyncResultStatus: { Succeeded: OfficeToken };
  EventType: {
    DialogEventReceived: OfficeToken;
    DialogMessageReceived: OfficeToken;
  };
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
    ui?: {
      displayDialogAsync?(
        url: string,
        options: {
          height: number;
          promptBeforeOpen: boolean;
          width: number;
        },
        callback: (result: OfficeAsyncResult<OfficeDialogLike>) => void,
      ): void;
      openBrowserWindow(url: string): void;
    };
  };
  onReady(): Promise<{
    host: OfficeToken | null;
    platform: OfficeToken | null;
  } | null>;
}

export interface OfficeRuntime {
  bindingStore: DocumentBindingStore;
  compressedFileAvailable: boolean;
  documentUrl: string;
  fileName: string | null;
  host: OfficeHost;
  platform: OfficePlatform;
  provider: OfficeCompressedFileProvider;
  openBrowserWindow(url: string): void;
  requestAuthentication(url: string): Promise<string>;
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
  const documentUrl = await getDocumentUrl(office);

  return {
    bindingStore: createDocumentBindingStore(office),
    compressedFileAvailable,
    documentUrl,
    fileName: getSavedFileName(documentUrl, host),
    host,
    platform,
    provider: createCompressedFileProvider(office),
    openBrowserWindow: (url) => {
      if (!office.context.ui) {
        throw new Error('This Office runtime cannot open the sign-in window.');
      }
      office.context.ui.openBrowserWindow(url);
    },
    requestAuthentication: (url) => requestAuthentication(office, url),
  };
}

function getDocumentUrl(office: OfficeApi): Promise<string> {
  const document = office.context.document;
  const fallback = document.url ?? '';
  if (typeof document.getFilePropertiesAsync !== 'function') {
    return Promise.resolve(fallback);
  }
  return new Promise((resolve) => {
    document.getFilePropertiesAsync?.((result) => {
      if (
        result.status === office.AsyncResultStatus.Succeeded &&
        typeof result.value?.url === 'string' &&
        result.value.url.trim() !== ''
      ) {
        resolve(result.value.url);
        return;
      }
      resolve(fallback);
    });
  });
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

function createDocumentBindingStore(office: OfficeApi): DocumentBindingStore {
  const settings = office.context.document.settings;
  return {
    clear: async () => {
      settings.remove(DOCUMENT_BINDING_SETTING);
      await saveSettings(office);
    },
    load: () => parseDocumentBinding(settings.get(DOCUMENT_BINDING_SETTING)),
    save: async (binding) => {
      settings.set(DOCUMENT_BINDING_SETTING, binding);
      await saveSettings(office);
    },
  };
}

function requestAuthentication(
  office: OfficeApi,
  url: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ui = office.context.ui;
    if (!ui || typeof ui.displayDialogAsync !== 'function') {
      reject(new Error('This Office runtime cannot open the sign-in dialog.'));
      return;
    }
    ui.displayDialogAsync(
      url,
      { height: 60, promptBeforeOpen: false, width: 40 },
      (result) => {
        if (result.status !== office.AsyncResultStatus.Succeeded) {
          reject(toOfficeError('Open Office sign-in dialog', result.error));
          return;
        }
        const dialog = result.value;
        let settled = false;
        const finish = (operation: () => void) => {
          if (settled) return;
          settled = true;
          dialog.close();
          operation();
        };
        dialog.addEventHandler(
          office.EventType.DialogMessageReceived,
          (event) => {
            try {
              const message = parseAuthenticationMessage(event.message);
              if (message.type === 'mergecom-office-auth-error') {
                finish(() => reject(new Error(message.message)));
                return;
              }
              finish(() => resolve(message.code));
            } catch (error) {
              finish(() =>
                reject(
                  error instanceof Error
                    ? error
                    : new Error('Office sign-in returned an invalid response.'),
                ),
              );
            }
          },
        );
        dialog.addEventHandler(
          office.EventType.DialogEventReceived,
          (event) => {
            finish(() =>
              reject(
                new Error(
                  event.error
                    ? `Office sign-in dialog closed (${event.error}).`
                    : 'Office sign-in dialog closed before authentication.',
                ),
              ),
            );
          },
        );
      },
    );
  });
}

type AuthenticationMessage =
  | { code: string; type: 'mergecom-office-session' }
  | { message: string; type: 'mergecom-office-auth-error' };

function parseAuthenticationMessage(
  value: string | undefined,
): AuthenticationMessage {
  if (!value || value.length > 500) {
    throw new Error('Office sign-in returned an invalid response.');
  }
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'type' in parsed &&
    parsed.type === 'mergecom-office-session' &&
    'code' in parsed &&
    typeof parsed.code === 'string' &&
    /^office_handoff_[A-Za-z0-9_-]{43}$/u.test(parsed.code)
  ) {
    return { code: parsed.code, type: parsed.type };
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'type' in parsed &&
    parsed.type === 'mergecom-office-auth-error' &&
    'message' in parsed &&
    typeof parsed.message === 'string' &&
    parsed.message.length > 0 &&
    parsed.message.length <= 200
  ) {
    return { message: parsed.message, type: parsed.type };
  }
  throw new Error('Office sign-in returned an invalid response.');
}

function saveSettings(office: OfficeApi): Promise<void> {
  return new Promise((resolve, reject) => {
    office.context.document.settings.saveAsync((result) => {
      if (result.status === office.AsyncResultStatus.Succeeded) {
        resolve();
        return;
      }
      reject(toOfficeError('Save MergeCom document binding', result.error));
    });
  });
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
