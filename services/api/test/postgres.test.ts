import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

const runInfrastructureTests = process.env.RUN_TESTCONTAINERS === 'true';

describe.runIf(runInfrastructureTests)('PostgreSQL readiness', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    app = await createApp({ databaseUrl: container.getConnectionUri() });
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('reports ready against a real PostgreSQL container', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
  });
});
