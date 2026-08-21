import { timingSafeEqual } from 'node:crypto';

import Fastify, { type FastifyServerOptions } from 'fastify';

import type { RenditionEngineConfig } from './config.js';
import { OfficeRenderer, RenditionError } from './renderer.js';

interface CreateAppOptions {
  config: RenditionEngineConfig;
  logger?: FastifyServerOptions['logger'];
  renderer?: Pick<OfficeRenderer, 'probe' | 'render'>;
}

function tokensEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function createApp(options: CreateAppOptions) {
  const app = Fastify({
    bodyLimit: options.config.maxInputBytes,
    logger: options.logger ?? false,
  });
  const renderer = options.renderer ?? new OfficeRenderer(options.config);
  let renditionCount = 0;
  let renditionDurationSeconds = 0;
  let renditionFailures = 0;
  let renditionTimeouts = 0;
  let renditionOutputBytes = 0;

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  app.get('/health/live', () => ({
    service: 'rendition-engine',
    status: 'alive',
  }));
  app.get('/health/ready', async (_request, reply) => {
    const toolchain = (await renderer.probe()) ? 'ready' : 'unavailable';
    const response = {
      dependencies: { toolchain },
      service: 'rendition-engine',
      status: toolchain === 'ready' ? 'ready' : 'not-ready',
    };
    return toolchain === 'ready' ? response : reply.code(503).send(response);
  });
  app.get('/metrics', (_request, reply) =>
    reply
      .type('text/plain; version=0.0.4')
      .send(
        [
          '# TYPE mergecom_rendition_duration_seconds summary',
          `mergecom_rendition_duration_seconds_count ${renditionCount}`,
          `mergecom_rendition_duration_seconds_sum ${renditionDurationSeconds}`,
          '# TYPE mergecom_rendition_failures_total counter',
          `mergecom_rendition_failures_total ${renditionFailures}`,
          '# TYPE mergecom_rendition_timeouts_total counter',
          `mergecom_rendition_timeouts_total ${renditionTimeouts}`,
          '# TYPE mergecom_rendition_output_bytes_total counter',
          `mergecom_rendition_output_bytes_total ${renditionOutputBytes}`,
          '',
        ].join('\n'),
      ),
  );

  app.post('/internal/v1/renditions', async (request, reply) => {
    const token = String(request.headers['x-mergecom-internal-token'] ?? '');
    if (!tokensEqual(token, options.config.internalToken)) {
      return reply.code(401).send({
        code: 'unauthorized',
        message: 'Internal authentication is required.',
      });
    }
    const extension = String(request.headers['x-mergecom-extension'] ?? '');
    const sourceSha256 = String(
      request.headers['x-mergecom-source-sha256'] ?? '',
    );
    const traceId = String(request.headers['x-mergecom-trace-id'] ?? '');
    if (
      !/^\.[a-z0-9]+$/u.test(extension) ||
      !/^[0-9a-f]{64}$/u.test(sourceSha256) ||
      !/^[0-9a-f-]{36}$/iu.test(traceId) ||
      !Buffer.isBuffer(request.body)
    ) {
      return reply.code(400).send({
        code: 'invalid_rendition_metadata',
        message: 'Rendition metadata is invalid.',
      });
    }
    const startedAt = performance.now();
    try {
      const output = await renderer.render({
        bytes: new Uint8Array(request.body),
        extension,
        sourceSha256,
        traceId,
      });
      const encodedManifest = Buffer.from(
        JSON.stringify(output.manifest),
      ).toString('base64url');
      renditionCount += 1;
      renditionDurationSeconds += (performance.now() - startedAt) / 1000;
      renditionOutputBytes += output.manifest.byteCount;
      return reply
        .header('cache-control', 'no-store')
        .header('x-mergecom-rendition-manifest', encodedManifest)
        .type('application/pdf')
        .send(Buffer.from(output.pdf));
    } catch (error) {
      if (error instanceof RenditionError) {
        renditionFailures += 1;
        if (error.code === 'rendition_timeout') renditionTimeouts += 1;
        return reply.code(error.retryable ? 503 : 422).send({
          code: error.code,
          message: 'The Office package could not produce a safe rendition.',
        });
      }
      renditionFailures += 1;
      request.log.error({ error, traceId }, 'Rendition dependency failed.');
      return reply.code(503).send({
        code: 'rendition_dependency_unavailable',
        message: 'The rendition dependency is unavailable.',
      });
    }
  });

  return app;
}
