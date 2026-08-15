import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';

import { loadConfig, type ApiConfig } from './config';
import { createDatabase } from './db/database';
import { registerAuthRoutes } from './identity/auth-routes';
import { createInvitationMailer } from './identity/invitation-mailer';
import { registerIdentityRoutes } from './identity/identity-routes';
import { OidcClient } from './identity/oidc';
import { PostgresIdentityStore } from './identity/postgres-store';
import type { IdentityStore } from './identity/store';
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
  config?: ApiConfig;
  databaseUrl?: string | undefined;
  identityStore?: IdentityStore;
  logger?: boolean;
  readinessProbe?: ReadinessProbe;
}

export async function createApp(options: CreateAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    logger: options.logger ?? false,
  }).withTypeProvider<TypeBoxTypeProvider>();
  const readinessProbe =
    options.readinessProbe ?? createPostgresReadinessProbe(options.databaseUrl);
  const database =
    !options.identityStore && options.databaseUrl
      ? createDatabase(options.databaseUrl)
      : null;
  const identityStore =
    options.identityStore ??
    (database
      ? new PostgresIdentityStore(database.pool, config.sessionIdleMilliseconds)
      : null);

  app.addHook('onClose', async () => {
    await readinessProbe.close?.();
    await database?.close();
  });

  await app.register(cookie);
  await app.register(cors, {
    credentials: true,
    origin: config.webOrigin,
  });
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      info: { title: 'MergeCom API', version: '0.2.0' },
      components: {
        securitySchemes: {
          sessionCookie: {
            in: 'cookie',
            name: config.cookieSecure
              ? '__Host-mergecom_session'
              : 'mergecom_session',
            type: 'apiKey',
          },
        },
      },
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

  if (identityStore) {
    const runtime = {
      config,
      invitationMailer: createInvitationMailer(config),
      oidcClient: config.oidc ? new OidcClient(config) : null,
      store: identityStore,
    };
    registerAuthRoutes(app, runtime);
    registerIdentityRoutes(app, runtime);
  }

  return app;
}
