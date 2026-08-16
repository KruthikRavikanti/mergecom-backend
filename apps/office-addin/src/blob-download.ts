import type { SignedBlobGrant } from './api';
import { resolveBrowserGrantUrl } from './blob-upload';

export interface DownloadProgress {
  loaded: number;
  total: number;
}

export type BlobDownloader = (
  grant: SignedBlobGrant,
  expectedBytes: number,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
) => Promise<Uint8Array>;

export const downloadBlob: BlobDownloader = (
  grant,
  expectedBytes,
  onProgress,
  signal,
) =>
  new Promise((resolve, reject) => {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
      reject(new Error('Expected download size must be a positive integer.'));
      return;
    }
    if (grant.method !== 'GET') {
      reject(new Error('The object download grant must use GET.'));
      return;
    }
    if (signal?.aborted) {
      reject(new DOMException('Download cancelled.', 'AbortError'));
      return;
    }

    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open('GET', resolveBrowserGrantUrl(grant.url));
    request.responseType = 'arraybuffer';
    for (const [name, value] of Object.entries(grant.headers)) {
      request.setRequestHeader(name, value);
    }
    request.addEventListener('progress', (event) => {
      onProgress({ loaded: event.loaded, total: event.total || expectedBytes });
    });
    request.addEventListener('load', () => {
      signal?.removeEventListener('abort', abort);
      if (request.status < 200 || request.status >= 300) {
        reject(
          new Error(`Object download failed with status ${request.status}.`),
        );
        return;
      }
      if (!(request.response instanceof ArrayBuffer)) {
        reject(
          new Error('Object storage returned an invalid binary response.'),
        );
        return;
      }
      const bytes = new Uint8Array(request.response);
      if (bytes.byteLength !== expectedBytes) {
        reject(
          new Error(
            `Object storage returned ${bytes.byteLength} bytes; expected ${expectedBytes} bytes.`,
          ),
        );
        return;
      }
      resolve(bytes);
    });
    request.addEventListener('error', () => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Object storage could not be reached.'));
    });
    request.addEventListener('abort', () => {
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Download cancelled.', 'AbortError'));
    });
    signal?.addEventListener('abort', abort, { once: true });
    request.send();
  });
