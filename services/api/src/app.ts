import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyServerOptions } from 'fastify';

import { loadConfig, type ApiConfig } from './config';
import { createDatabase } from './db/database';
import { registerAuthRoutes } from './identity/auth-routes';
import { createInvitationMailer } from './identity/invitation-mailer';
import { registerIdentityRoutes } from './identity/identity-routes';
import { OidcClient } from './identity/oidc';
import { PostgresIdentityStore } from './identity/postgres-store';
import type { IdentityStore } from './identity/store';
import { PostgresNotificationStore } from './notifications/postgres-store';
import { registerNotificationRoutes } from './notifications/routes';
import type { NotificationStore } from './notifications/store';
import { PostgresProjectStore } from './projects/postgres-store';
import { registerProjectRoutes } from './projects/routes';
import type { ProjectStore } from './projects/store';
import { createPostgresReadinessProbe, type ReadinessProbe } from './readiness';
import { PostgresReviewStore } from './reviews/postgres-store';
import { registerReviewRoutes } from './reviews/routes';
import type { ReviewStore } from './reviews/store';
import type { BlobStore } from './storage/blob-store';
import { S3BlobStore } from './storage/s3-blob-store';
import { PostgresVersionStore } from './versions/postgres-store';
import { registerVersionRoutes } from './versions/routes';
import { VersionService } from './versions/service';
import type { VersionStore } from './versions/store';
import { PostgresWorkspaceStore } from './workspace/postgres-store';
import { registerWorkspaceRoutes } from './workspace/routes';
import type { WorkspaceStore } from './workspace/store';

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
  blobStore?: BlobStore;
  config?: ApiConfig;
  databaseUrl?: string | undefined;
  identityStore?: IdentityStore;
  logger?: FastifyServerOptions['logger'];
  notificationStore?: NotificationStore;
  projectStore?: ProjectStore;
  readinessProbe?: ReadinessProbe;
  reviewStore?: ReviewStore;
  versionService?: VersionService;
  versionStore?: VersionStore;
  workspaceStore?: WorkspaceStore;
  trustProxy?: FastifyServerOptions['trustProxy'];
}

export async function createApp(options: CreateAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
  }).withTypeProvider<TypeBoxTypeProvider>();
  const database =
    (!options.identityStore ||
      !options.projectStore ||
      !options.reviewStore ||
      !options.notificationStore ||
      !options.versionStore ||
      !options.workspaceStore) &&
    options.databaseUrl
      ? createDatabase(options.databaseUrl)
      : null;
  const identityStore =
    options.identityStore ??
    (database
      ? new PostgresIdentityStore(database.pool, config.sessionIdleMilliseconds)
      : null);
  const projectStore =
    options.projectStore ??
    (database ? new PostgresProjectStore(database.pool) : null);
  const reviewStore =
    options.reviewStore ??
    (database ? new PostgresReviewStore(database.pool) : null);
  const notificationStore =
    options.notificationStore ??
    (database ? new PostgresNotificationStore(database.pool) : null);
  const workspaceStore =
    options.workspaceStore ??
    (database ? new PostgresWorkspaceStore(database.pool) : null);
  const blobStore =
    options.blobStore ??
    (config.blobStorage ? new S3BlobStore(config.blobStorage) : null);
  const versionStore =
    options.versionStore ??
    (database && config.blobStorage
      ? new PostgresVersionStore(
          database.pool,
          config.blobStorage.organizationQuotaBytes,
        )
      : null);
  const versionService =
    options.versionService ??
    (versionStore && blobStore && config.blobStorage
      ? new VersionService(
          versionStore,
          blobStore,
          config.blobStorage,
          undefined,
          config.rendition,
        )
      : null);
  const readinessProbe =
    options.readinessProbe ??
    createPostgresReadinessProbe(options.databaseUrl, blobStore ?? undefined);
  const cleanupTimer =
    versionService && config.blobStorage
      ? setInterval(() => {
          void versionService.cleanup().catch((error: unknown) => {
            app.log.error({ error }, 'Artifact cleanup failed.');
          });
        }, config.blobStorage.cleanupIntervalMilliseconds)
      : null;
  cleanupTimer?.unref();

  app.addHook('onClose', async () => {
    if (cleanupTimer) clearInterval(cleanupTimer);
    await readinessProbe.close?.();
    await database?.close();
  });

  await app.register(cookie);
  const allowedBrowserOrigins = [
    ...new Set([config.webOrigin, config.officeAddinOrigin]),
  ];
  await app.register(cors, {
    credentials: true,
    origin: allowedBrowserOrigins,
  });
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      info: { title: 'MergeCom API', version: '0.9.0' },
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

  app.get('/metrics', async (_request, reply) =>
    reply
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(versionService?.metrics.render() ?? ''),
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
    if (notificationStore) {
      registerNotificationRoutes(app, { ...runtime, notificationStore });
    }
    if (projectStore) {
      registerProjectRoutes(app, { ...runtime, projectStore });
    }
    if (versionService) {
      registerVersionRoutes(app, { ...runtime, versionService });
    }
    if (reviewStore) {
      registerReviewRoutes(app, { ...runtime, reviewStore });
    }
    if (workspaceStore) {
      registerWorkspaceRoutes(app, { ...runtime, workspaceStore });
    }
  }

  return app;
}
