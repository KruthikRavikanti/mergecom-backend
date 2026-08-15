import Fastify from 'fastify';

import {
  createRedisReadinessProbe,
  type RedisReadinessProbe,
} from './readiness';

interface CreateAppOptions {
  logger?: boolean;
  readinessProbe?: RedisReadinessProbe;
  redisUrl?: string | undefined;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  const readinessProbe =
    options.readinessProbe ?? createRedisReadinessProbe(options.redisUrl);

  app.addHook('onClose', async () => {
    await readinessProbe.close?.();
  });

  app.get('/health/live', () => ({ service: 'worker', status: 'alive' }));
  app.get('/health/ready', async (_request, reply) => {
    const redis = await readinessProbe();
    const response = {
      dependencies: { redis },
      service: 'worker',
      status: redis === 'ready' ? 'ready' : 'not-ready',
    };
    return redis === 'ready' ? response : reply.code(503).send(response);
  });

  return app;
}
