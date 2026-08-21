import { createApp } from './app.js';
import { loadRenditionEngineConfig } from './config.js';

const config = loadRenditionEngineConfig();
const app = createApp({
  config,
  logger: {
    level: config.logLevel,
    redact: {
      censor: '[REDACTED]',
      paths: ['req.headers.x-mergecom-internal-token'],
    },
  },
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ host: config.host, port: config.port });
