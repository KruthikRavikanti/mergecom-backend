import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RenditionEngineClient } from './rendition-engine-client';
import { PermanentProcessingError, type ClaimedRenditionJob } from './types';

const job: ClaimedRenditionJob = {
  artifactByteSize: 4,
  artifactObjectKey: 'source.docx',
  artifactSha256: 'a'.repeat(64),
  attempts: 1,
  extension: '.docx',
  fileType: 'word_document',
  fontPackVersion: 'fonts-v1',
  id: '10000000-0000-4000-8000-000000000001',
  maxAttempts: 3,
  organizationId: '20000000-0000-4000-8000-000000000001',
  rendererProfile: 'office-pdf-v1',
  rendererVersion: 'renderer-v1',
  renditionId: '30000000-0000-4000-8000-000000000001',
  traceId: '40000000-0000-4000-8000-000000000001',
  versionId: '50000000-0000-4000-8000-000000000001',
};

afterEach(() => vi.unstubAllGlobals());

describe('RenditionEngineClient', () => {
  it('rejects a manifest whose hash does not match the returned PDF', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n%%EOF');
    const manifest = {
      byteCount: pdf.byteLength,
      dimensions: [{ height: 792, width: 612 }],
      fontPackVersion: job.fontPackVersion,
      outputSha256: createHash('sha256').update('different').digest('hex'),
      pageCount: 1,
      rendererProfile: job.rendererProfile,
      rendererVersion: job.rendererVersion,
      warnings: [],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(pdf, {
            headers: {
              'content-type': 'application/pdf',
              'x-mergecom-rendition-manifest': Buffer.from(
                JSON.stringify(manifest),
              ).toString('base64url'),
            },
            status: 200,
          }),
        ),
      ),
    );

    const client = new RenditionEngineClient(
      'http://rendition-engine:3004',
      'internal-token-that-is-at-least-32-characters',
    );
    await expect(
      client.render(job, Uint8Array.from([1, 2, 3, 4])),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PermanentProcessingError>>({
        code: 'invalid_rendition_engine_response',
      }),
    );
  });
});
