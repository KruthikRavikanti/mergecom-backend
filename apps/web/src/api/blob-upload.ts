import type { components } from '@mergecom/contracts';

type SignedBlobGrant = components['schemas']['SignedBlobGrant'];

export interface UploadProgress {
  loaded: number;
  total: number;
}

export function uploadBlob(
  grant: SignedBlobGrant,
  body: Blob,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled.', 'AbortError'));
      return;
    }
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open('PUT', grant.url);
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
}
