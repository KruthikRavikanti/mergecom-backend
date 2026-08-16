import { describe, expect, it, vi } from 'vitest';

import type { CapturedOfficePackage } from '@mergecom/office-core';

import type {
  FinalizeVersionResult,
  SignedBlobGrant,
  UploadIntent,
} from './api';
import type { DocumentBinding } from './document-binding';
import { pushCapturedVersion, type OfficeVersionGateway } from './push-version';

const binding: DocumentBinding = {
  documentId: '60000000-0000-4000-8000-000000000002',
  documentKind: 'spreadsheet',
  organizationId: '10000000-0000-4000-8000-000000000001',
  projectId: '40000000-0000-4000-8000-000000000001',
  schemaVersion: 1,
};
const capture: CapturedOfficePackage = {
  bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]),
  descriptor: {
    contentLength: 8,
    fileName: 'Operating Model.xlsx',
    mediaType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sha256: 'a'.repeat(64),
    sourceHost: 'excel',
  },
};
const grant: SignedBlobGrant = {
  expiresAt: '2026-08-16T12:00:00.000Z',
  headers: {},
  method: 'PUT',
  url: 'https://storage.example/upload',
};
const finalized = {
  currentHeadVersionId: '70000000-0000-4000-8000-000000000001',
  outcome: 'created',
  replayed: false,
  version: { id: '70000000-0000-4000-8000-000000000001' },
} as FinalizeVersionResult;

function intent(overrides: Partial<UploadIntent> = {}): UploadIntent {
  return {
    branch: { headVersionId: null, id: crypto.randomUUID(), name: 'main' },
    expiresAt: '2026-08-16T12:00:00.000Z',
    grant,
    id: '80000000-0000-4000-8000-000000000001',
    mode: 'single',
    multipart: null,
    ...overrides,
  };
}

function gateway(uploadIntent = intent()) {
  return {
    cancelUpload: vi.fn().mockResolvedValue(undefined),
    completeMultipart: vi.fn().mockResolvedValue(undefined),
    createUploadIntent: vi.fn().mockResolvedValue(uploadIntent),
    finalizeUpload: vi.fn().mockResolvedValue(finalized),
    signMultipartPart: vi.fn().mockResolvedValue(grant),
  } satisfies OfficeVersionGateway;
}

describe('pushCapturedVersion', () => {
  it('uploads exact bytes and finalizes with Office provenance', async () => {
    const api = gateway();
    const upload = vi.fn().mockResolvedValue('');
    const result = await pushCapturedVersion({
      api,
      baseVersionId: null,
      binding,
      capture,
      csrfToken: 'csrf-token-long-enough-for-the-api',
      idempotencyKey: () => 'idempotency-key',
      note: 'Updated operating assumptions',
      onProgress: vi.fn(),
      onStage: vi.fn(),
      upload,
    });

    expect(result).toBe(finalized);
    expect(await (upload.mock.calls[0]?.[1] as Blob).arrayBuffer()).toEqual(
      capture.bytes.buffer,
    );
    expect(api.finalizeUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Updated operating assumptions',
        source: 'office_addin',
      }),
    );
    expect(api.cancelUpload).not.toHaveBeenCalled();
  });

  it('uploads multipart grants in order and completes their ETags', async () => {
    const api = gateway(
      intent({
        grant: null,
        mode: 'multipart',
        multipart: { partCount: 3, partSize: 3 },
      }),
    );
    const sizes: number[] = [];
    const upload = vi.fn((_grant, body: Blob) => {
      sizes.push(body.size);
      return Promise.resolve(`etag-${sizes.length}`);
    });

    await pushCapturedVersion({
      api,
      baseVersionId: null,
      binding,
      capture,
      csrfToken: 'csrf-token-long-enough-for-the-api',
      idempotencyKey: () => 'idempotency-key',
      note: 'Multipart update',
      onProgress: vi.fn(),
      onStage: vi.fn(),
      upload,
    });

    expect(sizes).toEqual([3, 3, 2]);
    expect(api.signMultipartPart).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ partNumber: 1 }),
    );
    expect(api.signMultipartPart).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ partNumber: 2 }),
    );
    expect(api.signMultipartPart).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ partNumber: 3 }),
    );
    expect(api.completeMultipart).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          { etag: 'etag-1', partNumber: 1 },
          { etag: 'etag-2', partNumber: 2 },
          { etag: 'etag-3', partNumber: 3 },
        ],
      }),
    );
  });

  it('cancels staged data while preserving the original upload failure', async () => {
    const api = gateway();
    api.cancelUpload.mockRejectedValue(new Error('cleanup unavailable'));

    await expect(
      pushCapturedVersion({
        api,
        baseVersionId: null,
        binding,
        capture,
        csrfToken: 'csrf-token-long-enough-for-the-api',
        note: 'Cancelled update',
        onProgress: vi.fn(),
        onStage: vi.fn(),
        upload: vi.fn().mockRejectedValue(new Error('storage unavailable')),
      }),
    ).rejects.toThrow('storage unavailable');
    expect(api.cancelUpload).toHaveBeenCalledOnce();
    expect(api.finalizeUpload).not.toHaveBeenCalled();
  });
});
