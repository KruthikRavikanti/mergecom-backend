import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () =>
  Promise.all(apps.splice(0).map(async (app) => app.close())),
);

describe('worker startup', () => {
  it('starts and serves liveness and readiness', async () => {
    const app = createApp({
      readinessProbe: () => Promise.resolve({ redis: 'ready' }),
    });
    apps.push(app);
    await app.ready();

    expect(
      (await app.inject({ method: 'GET', url: '/health/live' })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/health/ready' })).statusCode,
    ).toBe(200);
  });
});
