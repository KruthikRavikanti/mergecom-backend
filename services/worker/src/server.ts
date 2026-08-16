import { ArtifactStorage } from './artifact-storage';
import { createApp } from './app';
import { loadWorkerConfig } from './config';
import { DocumentEngineClient } from './document-engine-client';
import { DocumentPipeline } from './pipeline';
import { ProcessingStore } from './processing-store';
import {
  createRedisReadinessProbe,
  type WorkerReadinessProbe,
} from './readiness';

const config = loadWorkerConfig();
const store = new ProcessingStore(config.databaseUrl);
const storage = new ArtifactStorage(config);
const engine = new DocumentEngineClient(
  config.documentEngineUrl,
  config.documentEngineToken,
);
const pipeline = new DocumentPipeline(config, store, storage, engine);
const redisProbe = createRedisReadinessProbe(config.redisUrl);
const readiness: WorkerReadinessProbe = async () => {
  const [redis, database, objectStorage, documentEngine] = await Promise.all([
    redisProbe(),
    store.probe(),
    storage.probe(),
    engine.probe(),
  ]);
  return {
    database: database ? 'ready' : 'unavailable',
    documentEngine: documentEngine ? 'ready' : 'unavailable',
    objectStorage: objectStorage ? 'ready' : 'unavailable',
    redis: redis.redis ?? 'unavailable',
  };
};
readiness.close = async () => {
  await pipeline.close();
  await store.close();
  await redisProbe.close?.();
};

await pipeline.start();
const app = createApp({ logger: true, readinessProbe: readiness });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ host: config.host, port: config.port });
