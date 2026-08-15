import { createApp } from './app';

const port = Number(process.env.WORKER_PORT ?? 3002);
const host = process.env.WORKER_HOST ?? '0.0.0.0';
const app = createApp({ logger: true, redisUrl: process.env.REDIS_URL });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ host, port });
