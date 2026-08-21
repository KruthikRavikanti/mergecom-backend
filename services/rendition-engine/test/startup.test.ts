import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { RenditionEngineConfig } from '../src/config';

describe('rendition engine startup', () => {
  it('reports the isolated toolchain state', async () => {
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
    const app = createApp({
      config,
      renderer: {
        probe: () => Promise.resolve(false),
        render: () => Promise.reject(new Error('not called')),
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      dependencies: { toolchain: 'unavailable' },
      status: 'not-ready',
    });
    await app.close();
  });
});
