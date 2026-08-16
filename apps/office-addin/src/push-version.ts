import type { CapturedOfficePackage } from '@mergecom/office-core';

import type {
  FinalizeVersionResult,
  SignedBlobGrant,
  UploadIntent,
} from './api';
import type { BlobUploader, UploadProgress } from './blob-upload';
import type { DocumentBinding } from './document-binding';

export interface UploadIntentInput {
  baseVersionId: string | null;
  binding: DocumentBinding;
  byteSize: number;
  csrfToken: string;
  fileName: string;
  idempotencyKey: string;
  mediaType: string;
  sha256: string;
}

export interface OfficeVersionGateway {
  cancelUpload(input: {
    binding: DocumentBinding;
    csrfToken: string;
    uploadId: string;
  }): Promise<void>;
  completeMultipart(input: {
    binding: DocumentBinding;
    csrfToken: string;
    parts: Array<{ etag: string; partNumber: number }>;
    uploadId: string;
  }): Promise<void>;
  createUploadIntent(input: UploadIntentInput): Promise<UploadIntent>;
  finalizeUpload(input: {
    binding: DocumentBinding;
    csrfToken: string;
    idempotencyKey: string;
    note: string;
    source: 'office_addin';
    uploadId: string;
  }): Promise<FinalizeVersionResult>;
  signMultipartPart(input: {
    binding: DocumentBinding;
    csrfToken: string;
    partNumber: number;
    uploadId: string;
  }): Promise<SignedBlobGrant>;
}

export type PushStage = 'creating-intent' | 'finalizing' | 'uploading';

export interface PushCapturedVersionInput {
  api: OfficeVersionGateway;
  baseVersionId: string | null;
  binding: DocumentBinding;
  capture: CapturedOfficePackage;
  csrfToken: string;
  idempotencyKey?: () => string;
  note: string;
  onProgress: (progress: UploadProgress) => void;
  onStage: (stage: PushStage) => void;
  signal?: AbortSignal;
  upload: BlobUploader;
}

export async function pushCapturedVersion(
  input: PushCapturedVersionInput,
): Promise<FinalizeVersionResult> {
  const idempotencyKey = input.idempotencyKey ?? (() => crypto.randomUUID());
  throwIfAborted(input.signal);
  input.onStage('creating-intent');
  const intent = await input.api.createUploadIntent({
    baseVersionId: input.baseVersionId,
    binding: input.binding,
    byteSize: input.capture.descriptor.contentLength,
    csrfToken: input.csrfToken,
    fileName: input.capture.descriptor.fileName,
    idempotencyKey: idempotencyKey(),
    mediaType: input.capture.descriptor.mediaType,
    sha256: input.capture.descriptor.sha256,
  });

  const body = new Blob([input.capture.bytes.slice().buffer], {
    type: input.capture.descriptor.mediaType,
  });
  try {
    input.onStage('uploading');
    if (intent.mode === 'single') {
      if (!intent.grant) throw new Error('Upload grant is unavailable.');
      await input.upload(intent.grant, body, input.onProgress, input.signal);
    } else {
      await uploadMultipart(input, intent, body);
    }

    throwIfAborted(input.signal);
    input.onStage('finalizing');
    return await input.api.finalizeUpload({
      binding: input.binding,
      csrfToken: input.csrfToken,
      idempotencyKey: idempotencyKey(),
      note: input.note,
      source: 'office_addin',
      uploadId: intent.id,
    });
  } catch (error) {
    await input.api
      .cancelUpload({
        binding: input.binding,
        csrfToken: input.csrfToken,
        uploadId: intent.id,
      })
      .catch(() => undefined);
    throw error;
  }
}

async function uploadMultipart(
  input: PushCapturedVersionInput,
  intent: UploadIntent,
  body: Blob,
): Promise<void> {
  if (!intent.multipart) throw new Error('Multipart details are unavailable.');
  const parts: Array<{ etag: string; partNumber: number }> = [];
  let completedBytes = 0;
  for (
    let partNumber = 1;
    partNumber <= intent.multipart.partCount;
    partNumber += 1
  ) {
    throwIfAborted(input.signal);
    const start = (partNumber - 1) * intent.multipart.partSize;
    const part = body.slice(
      start,
      Math.min(body.size, start + intent.multipart.partSize),
    );
    const grant = await input.api.signMultipartPart({
      binding: input.binding,
      csrfToken: input.csrfToken,
      partNumber,
      uploadId: intent.id,
    });
    const etag = await input.upload(
      grant,
      part,
      ({ loaded }) =>
        input.onProgress({
          loaded: completedBytes + loaded,
          total: body.size,
        }),
      input.signal,
    );
    if (!etag) throw new Error('Object storage did not return a part ETag.');
    parts.push({ etag, partNumber });
    completedBytes += part.size;
  }
  await input.api.completeMultipart({
    binding: input.binding,
    csrfToken: input.csrfToken,
    parts,
    uploadId: intent.id,
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new DOMException('Upload cancelled.', 'AbortError');
}
