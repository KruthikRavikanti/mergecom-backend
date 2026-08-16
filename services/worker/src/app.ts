import Fastify from 'fastify';

import {
  createRedisReadinessProbe,
  type WorkerReadinessProbe,
} from './readiness';

interface CreateAppOptions {
  logger?: boolean;
  readinessProbe?: WorkerReadinessProbe;
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
    const dependencies = await readinessProbe();
    const ready = Object.values(dependencies).every(
      (dependency) => dependency === 'ready',
    );
    const response = {
      dependencies,
      service: 'worker',
      status: ready ? 'ready' : 'not-ready',
    };
    return ready ? response : reply.code(503).send(response);
  });

  return app;
}
