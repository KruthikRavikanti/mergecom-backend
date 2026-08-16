import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () =>
  Promise.all(apps.splice(0).map(async (app) => app.close())),
);

describe('API startup', () => {
  it('starts and serves liveness and readiness', async () => {
    const app = await createApp({
      readinessProbe: () => Promise.resolve({ database: 'ready' }),
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

  it('allows only configured browser origins through CORS', async () => {
    const app = await createApp({
      readinessProbe: () => Promise.resolve({ database: 'ready' }),
    });
    apps.push(app);
    await app.ready();

    const office = await app.inject({
      headers: {
        origin: 'https://localhost:5176',
        'access-control-request-method': 'POST',
      },
      method: 'OPTIONS',
      url: '/v1/session/organization',
    });
    expect(office.statusCode).toBe(204);
    expect(office.headers['access-control-allow-origin']).toBe(
      'https://localhost:5176',
    );

    const hostile = await app.inject({
      headers: {
        origin: 'https://localhost.attacker.example',
        'access-control-request-method': 'POST',
      },
      method: 'OPTIONS',
      url: '/v1/session/organization',
    });
    expect(hostile.headers['access-control-allow-origin']).toBeUndefined();
  });
});
