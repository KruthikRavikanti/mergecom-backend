import swagger from '@fastify/swagger';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';

import { createPostgresReadinessProbe, type ReadinessProbe } from './readiness';

const DependencyState = Type.Union([
  Type.Literal('ready'),
  Type.Literal('unavailable'),
]);
const Liveness = Type.Object({
  service: Type.String(),
  status: Type.Literal('alive'),
});
const Readiness = Type.Object({
  dependencies: Type.Record(Type.String(), DependencyState),
  service: Type.String(),
  status: Type.Union([Type.Literal('ready'), Type.Literal('not-ready')]),
});

interface CreateAppOptions {
  databaseUrl?: string | undefined;
  logger?: boolean;
  readinessProbe?: ReadinessProbe;
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
  }).withTypeProvider<TypeBoxTypeProvider>();
  const readinessProbe =
    options.readinessProbe ?? createPostgresReadinessProbe(options.databaseUrl);

  app.addHook('onClose', async () => {
    await readinessProbe.close?.();
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'MergeCom API', version: '0.1.0' },
    },
  });

  app.get('/health/live', { schema: { response: { 200: Liveness } } }, () => ({
    service: 'api',
    status: 'alive' as const,
  }));

  app.get(
    '/health/ready',
    { schema: { response: { 200: Readiness, 503: Readiness } } },
    async (_request, reply) => {
      const dependencies = await readinessProbe();
      const ready = Object.values(dependencies).every(
        (state) => state === 'ready',
      );
      const response = {
        dependencies,
        service: 'api',
        status: ready ? ('ready' as const) : ('not-ready' as const),
      };
      return ready ? response : reply.code(503).send(response);
    },
  );

  return app;
}
