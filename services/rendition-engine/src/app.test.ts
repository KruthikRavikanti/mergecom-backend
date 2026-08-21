import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createApp } from './app';
import type { RenditionEngineConfig } from './config';

const config: RenditionEngineConfig = {
  fontPackVersion: 'fonts-test',
  host: '127.0.0.1',
  internalToken: 'test-rendition-token-that-is-long-enough',
  logLevel: 'silent',
  maxInputBytes: 1024,
  maxOutputBytes: 2048,
  nodeEnv: 'test',
  port: 3004,
  qpdfPath: 'qpdf',
  rendererProfile: 'office-pdf-v1',
  rendererVersion: 'renderer-test',
  sofficePath: 'soffice',
  tempRoot: '/tmp/mergecom-rendition-test',
  timeoutMilliseconds: 1000,
};

describe('rendition engine app', () => {
  it('protects the internal endpoint and returns a versioned PDF manifest', async () => {
    const source = new TextEncoder().encode('office package');
    const pdf = new TextEncoder().encode(
      '%PDF-1.7\n1 0 obj <</Type /Page>> endobj\n%%EOF',
    );
    const renderer = {
      probe: vi.fn(() => Promise.resolve(true)),
      render: vi.fn(() =>
        Promise.resolve({
          manifest: {
            byteCount: pdf.byteLength,
            dimensions: [{ height: 792, width: 612 }],
            fontPackVersion: 'fonts-test',
            outputSha256: createHash('sha256').update(pdf).digest('hex'),
            pageCount: 1,
            rendererProfile: 'office-pdf-v1',
            rendererVersion: 'renderer-test',
            warnings: [],
          },
          pdf,
        }),
      ),
    };
    const app = createApp({ config, renderer });
    const unauthorized = await app.inject({
      headers: { 'content-type': 'application/octet-stream' },
      method: 'POST',
      payload: Buffer.from(source),
      url: '/internal/v1/renditions',
    });
    expect(unauthorized.statusCode).toBe(401);

    const response = await app.inject({
      headers: {
        'content-type': 'application/octet-stream',
        'x-mergecom-extension': '.docx',
        'x-mergecom-internal-token': config.internalToken,
        'x-mergecom-source-sha256': createHash('sha256')
          .update(source)
          .digest('hex'),
        'x-mergecom-trace-id': '10000000-0000-4000-8000-000000000001',
      },
      method: 'POST',
      payload: Buffer.from(source),
      url: '/internal/v1/renditions',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    const manifest = JSON.parse(
      Buffer.from(
        String(response.headers['x-mergecom-rendition-manifest']),
        'base64url',
      ).toString('utf8'),
    );
    expect(manifest).toMatchObject({
      pageCount: 1,
      rendererVersion: 'renderer-test',
    });
    await app.close();
  });
});
