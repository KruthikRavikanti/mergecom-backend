import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { ApiConfig } from '../src/config';

const suppliedDatabaseUrl = process.env.TEST_DATABASE_URL;
const runInfrastructureTests =
  process.env.RUN_TESTCONTAINERS === 'true' || Boolean(suppliedDatabaseUrl);

describe.runIf(runInfrastructureTests)('PostgreSQL readiness', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;

  const config = (databaseUrl: string): ApiConfig => ({
    apiPublicOrigin: 'http://localhost:3001',
    authMode: 'development',
    cookieSecure: false,
    databaseUrl,
    exposeInvitationLinks: true,
    invitationMail: null,
    logLevel: 'silent',
    nodeEnv: 'test',
    officeAddinOrigin: 'https://localhost:5176',
    oidc: null,
    sessionAbsoluteMilliseconds: 24 * 60 * 60 * 1000,
    sessionIdleMilliseconds: 60 * 60 * 1000,
    trustedProxyHops: 0,
    webOrigin: 'http://localhost:5173',
  });

  beforeAll(async () => {
    const databaseUrl = suppliedDatabaseUrl
      ? suppliedDatabaseUrl
      : (container = await new PostgreSqlContainer(
          'postgres:17-alpine',
        ).start()).getConnectionUri();
    app = await createApp({ config: config(databaseUrl), databaseUrl });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await container?.stop();
  });

  it('reports ready against a real PostgreSQL container', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      dependencies: { database: 'ready' },
      service: 'api',
      status: 'ready',
    });
  });
});
