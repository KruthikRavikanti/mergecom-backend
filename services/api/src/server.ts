import { createApp } from './app';
import { loadConfig } from './config';

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? '0.0.0.0';
const config = loadConfig();
const app = await createApp({
  config,
  databaseUrl: config.databaseUrl,
  logger: {
    level: config.logLevel,
    redact: {
      censor: '[REDACTED]',
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-csrf-token',
        'res.headers.set-cookie',
      ],
    },
  },
  trustProxy: config.trustedProxyHops || false,
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ host, port });
