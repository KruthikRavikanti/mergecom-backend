import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

const suppliedDatabaseUrl = process.env.TEST_DATABASE_URL;
const runInfrastructureTests =
  process.env.RUN_TESTCONTAINERS === 'true' || Boolean(suppliedDatabaseUrl);

describe.runIf(runInfrastructureTests)('PostgreSQL readiness', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;

  beforeAll(async () => {
    const databaseUrl = suppliedDatabaseUrl
      ? suppliedDatabaseUrl
      : (container = await new PostgreSqlContainer(
          'postgres:17-alpine',
        ).start()).getConnectionUri();
    app = await createApp({ databaseUrl });
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await container?.stop();
  });

  it('reports ready against a real PostgreSQL container', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
  });
});
