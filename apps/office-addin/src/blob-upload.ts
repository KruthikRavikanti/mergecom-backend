import type { SignedBlobGrant } from './api';

export interface UploadProgress {
  loaded: number;
  total: number;
}

export type BlobUploader = (
  grant: SignedBlobGrant,
  body: Blob,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal,
) => Promise<string>;

export const uploadBlob: BlobUploader = (grant, body, onProgress, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled.', 'AbortError'));
      return;
    }
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open(grant.method, browserGrantUrl(grant.url));
    for (const [name, value] of Object.entries(grant.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.addEventListener('progress', (event) => {
      onProgress({ loaded: event.loaded, total: event.total || body.size });
    });
    request.addEventListener('load', () => {
      signal?.removeEventListener('abort', abort);
      if (request.status >= 200 && request.status < 300) {
        resolve(request.getResponseHeader('etag') ?? '');
      } else {
        reject(
          new Error(`Object upload failed with status ${request.status}.`),
        );
      }
    });
    request.addEventListener('error', () => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Object storage could not be reached.'));
    });
    request.addEventListener('abort', () => {
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Upload cancelled.', 'AbortError'));
    });
    signal?.addEventListener('abort', abort, { once: true });
    request.send(body);
  });

export function rewriteLocalGrantUrl(
  grantUrl: string,
  localBlobOrigin: string,
  proxyBaseUrl: string,
): string {
  const source = new URL(grantUrl);
  if (source.origin !== new URL(localBlobOrigin).origin) return grantUrl;
  const proxy = new URL(proxyBaseUrl);
  proxy.pathname = `${proxy.pathname.replace(/\/$/u, '')}${source.pathname}`;
  proxy.search = source.search;
  return proxy.href;
}

function browserGrantUrl(grantUrl: string): string {
  if (!import.meta.env.DEV) return grantUrl;
  return rewriteLocalGrantUrl(
    grantUrl,
    import.meta.env.VITE_LOCAL_BLOB_ORIGIN ?? 'http://localhost:9000',
    new URL('/blob', window.location.origin).href,
  );
}
