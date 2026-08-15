import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from './app';

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () =>
  Promise.all(apps.splice(0).map(async (app) => app.close())),
);

describe('worker health', () => {
  it('does not report ready when Redis is unavailable', async () => {
    const app = createApp({
      readinessProbe: () => Promise.resolve('unavailable'),
    });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'not-ready' });
  });
});
