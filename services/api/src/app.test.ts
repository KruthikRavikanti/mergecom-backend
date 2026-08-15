import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from './app';

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () =>
  Promise.all(apps.splice(0).map(async (app) => app.close())),
);

describe('API health', () => {
  it('does not report ready when PostgreSQL is unavailable', async () => {
    const app = await createApp({
      readinessProbe: () => Promise.resolve({ database: 'unavailable' }),
    });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'not-ready' });
  });
});
