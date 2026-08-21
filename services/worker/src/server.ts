import { ArtifactStorage } from './artifact-storage';
import { createApp } from './app';
import { loadWorkerConfig } from './config';
import { DocumentEngineClient } from './document-engine-client';
import { createNotificationMailer } from './notification-mailer';
import { NotificationPipeline } from './notification-pipeline';
import { NotificationStore } from './notification-store';
import { DocumentPipeline } from './pipeline';
import { ProcessingStore } from './processing-store';
import { RenditionEngineClient } from './rendition-engine-client';
import { WorkerMetrics } from './metrics';
import {
  createRedisReadinessProbe,
  type WorkerReadinessProbe,
} from './readiness';

const config = loadWorkerConfig();
const store = new ProcessingStore(
  config.databaseUrl,
  config.organizationQuotaBytes,
);
const storage = new ArtifactStorage(config);
const engine = new DocumentEngineClient(
  config.documentEngineUrl,
  config.documentEngineToken,
);
const renditionEngine = new RenditionEngineClient(
  config.renditionEngineUrl,
  config.renditionEngineToken,
);
const metrics = new WorkerMetrics();
const pipeline = new DocumentPipeline(
  config,
  store,
  storage,
  engine,
  renditionEngine,
  metrics,
);
const notificationStore = new NotificationStore(config.databaseUrl);
const notificationPipeline = new NotificationPipeline(
  config,
  notificationStore,
  createNotificationMailer({
    from: config.notificationFrom,
    smtpUrl: config.smtpUrl,
    webOrigin: config.webOrigin,
  }),
);
const redisProbe = createRedisReadinessProbe(config.redisUrl);
const readiness: WorkerReadinessProbe = async () => {
  const [
    redis,
    database,
    notificationDatabase,
    objectStorage,
    documentEngine,
    rendition,
  ] = await Promise.all([
    redisProbe(),
    store.probe(),
    notificationStore.probe(),
    storage.probe(),
    engine.probe(),
    renditionEngine.probe(),
  ]);
  return {
    database: database && notificationDatabase ? 'ready' : 'unavailable',
    documentEngine: documentEngine ? 'ready' : 'unavailable',
    objectStorage: objectStorage ? 'ready' : 'unavailable',
    redis: redis.redis ?? 'unavailable',
    renditionEngine: rendition ? 'ready' : 'unavailable',
  };
};
readiness.close = async () => {
  await Promise.all([
    pipeline.close(),
    notificationPipeline.close(),
    store.close(),
    notificationStore.close(),
  ]);
  await redisProbe.close?.();
};

await Promise.all([pipeline.start(), notificationPipeline.start()]);
const app = createApp({
  logger: {
    level: config.logLevel,
    redact: {
      censor: '[REDACTED]',
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-mergecom-internal-token',
        'res.headers.set-cookie',
      ],
    },
  },
  readinessProbe: readiness,
  metrics,
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ host: config.host, port: config.port });
