import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { ApiConfig } from '../src/config';
import { createDatabase, type DatabaseContext } from '../src/db/database';
import { PostgresIdentityStore } from '../src/identity/postgres-store';
import { createSessionMaterial } from '../src/identity/session';
import { hashToken } from '../src/security/crypto';

const suppliedDatabaseUrl = process.env.TEST_DATABASE_URL;
const runInfrastructureTests =
  process.env.RUN_TESTCONTAINERS === 'true' || Boolean(suppliedDatabaseUrl);
const organizationA = '10000000-0000-4000-8000-000000000001';
const organizationB = '10000000-0000-4000-8000-000000000002';
const ownerA = '20000000-0000-4000-8000-000000000001';
const adminA = '20000000-0000-4000-8000-000000000002';
const viewerA = '20000000-0000-4000-8000-000000000003';
const suspendedA = '20000000-0000-4000-8000-000000000004';
const invitee = '20000000-0000-4000-8000-000000000005';
const ownerB = '20000000-0000-4000-8000-000000000006';
const viewerMembership = '30000000-0000-4000-8000-000000000003';

describe.runIf(runInfrastructureTests)('identity and tenant API', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
  let database: DatabaseContext;

  const config = (databaseUrl: string): ApiConfig => ({
    apiPublicOrigin: 'http://localhost:3001',
    authMode: 'development',
    cookieSecure: false,
    databaseUrl,
    exposeInvitationLinks: true,
    invitationMail: null,
    nodeEnv: 'test',
    officeAddinOrigin: 'https://localhost:5176',
    oidc: null,
    sessionAbsoluteMilliseconds: 24 * 60 * 60 * 1000,
    sessionIdleMilliseconds: 60 * 60 * 1000,
    webOrigin: 'http://localhost:5173',
  });

  beforeAll(async () => {
    const databaseUrl = suppliedDatabaseUrl
      ? suppliedDatabaseUrl
      : (container = await new PostgreSqlContainer(
          'postgres:17-alpine',
        ).start()).getConnectionUri();
    database = createDatabase(databaseUrl);
    await migrate(database.db, { migrationsFolder: 'drizzle' });
    app = await createApp({
      config: config(databaseUrl),
      databaseUrl,
    });
    await app.ready();
  }, 120_000);

  beforeEach(async () => {
    await database.pool.query(
      `truncate audit_events, sessions, invitations, memberships,
                identity_mappings, organization_identity_policies,
                organization_bootstrap_grants, oidc_transactions,
                users, organizations restart identity cascade`,
    );
    await database.pool.query(
      `insert into organizations (id, name, slug) values
        ($1, 'Alpha Advisory', 'alpha-advisory'),
        ($2, 'Beta Capital', 'beta-capital')`,
      [organizationA, organizationB],
    );
    const users = [
      [ownerA, 'Alpha Owner', 'alpha-owner@mergecom.test', 'alpha-owner'],
      [adminA, 'Alpha Admin', 'alpha-admin@mergecom.test', 'alpha-admin'],
      [viewerA, 'Alpha Viewer', 'alpha-viewer@mergecom.test', 'alpha-viewer'],
      [
        suspendedA,
        'Alpha Reviewer',
        'alpha-reviewer@mergecom.test',
        'alpha-reviewer',
      ],
      [
        invitee,
        'External Invitee',
        'alpha-external-reviewer@mergecom.test',
        'alpha-external-reviewer',
      ],
      [ownerB, 'Beta Owner', 'beta-owner@mergecom.test', 'beta-owner'],
    ] as const;
    for (const [id, name, email, subject] of users) {
      await database.pool.query(
        `insert into users (id, display_name, primary_email, email_verified)
         values ($1, $2, $3, true)`,
        [id, name, email],
      );
      await database.pool.query(
        `insert into identity_mappings
          (user_id, issuer, provider_tenant_id, provider_subject,
           email_claim, email_verified)
         values ($1, 'https://identity.local.mergecom',
                 'local-development', $2, $3, true)`,
        [id, subject, email],
      );
    }
    await database.pool.query(
      `insert into memberships (id, organization_id, user_id, role, status) values
        ('30000000-0000-4000-8000-000000000001', $1, $2, 'owner', 'active'),
        ('30000000-0000-4000-8000-000000000002', $1, $3, 'admin', 'active'),
        ($4, $1, $5, 'viewer', 'active'),
        ('30000000-0000-4000-8000-000000000004', $1, $6, 'reviewer', 'suspended'),
        ('30000000-0000-4000-8000-000000000006', $7, $8, 'owner', 'active')`,
      [
        organizationA,
        ownerA,
        adminA,
        viewerMembership,
        viewerA,
        suspendedA,
        organizationB,
        ownerB,
      ],
    );
  });

  afterAll(async () => {
    await app.close();
    await database.close();
    await container?.stop();
  });

  async function login(identity: string) {
    const response = await app.inject({
      body: { identity },
      method: 'POST',
      url: '/auth/development/session',
    });
    expect(response.statusCode).toBe(200);
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = (
      Array.isArray(setCookie) ? setCookie[0] : setCookie
    )?.split(';')[0];
    expect(cookieHeader).toBeTruthy();
    const me = await app.inject({
      headers: { cookie: cookieHeader! },
      method: 'GET',
      url: '/v1/me',
    });
    expect(me.statusCode).toBe(200);
    return {
      cookie: cookieHeader!,
      csrf: me.json().session.csrfToken as string,
    };
  }

  function secureHeaders(session: { cookie: string; csrf: string }) {
    return {
      cookie: session.cookie,
      origin: 'http://localhost:5173',
      'x-csrf-token': session.csrf,
    };
  }

  async function createInvite(session: {
    cookie: string;
    csrf: string;
  }): Promise<{ response: LightMyRequestResponse; token: string }> {
    const response = await app.inject({
      body: {
        email: 'alpha-external-reviewer@mergecom.test',
        role: 'external_reviewer',
      },
      headers: secureHeaders(session),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/invitations`,
    });
    const acceptanceUrl = response.json().acceptanceUrl as string;
    return {
      response,
      token: decodeURIComponent(
        new URL(acceptanceUrl).pathname.split('/').at(-1)!,
      ),
    };
  }

  it('lists memberships for the active tenant', async () => {
    const session = await login('alpha-owner');
    const response = await app.inject({
      headers: { cookie: session.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/memberships`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().memberships).toHaveLength(4);
  });

  it('denies cross-tenant reads and writes without leaking existence', async () => {
    const session = await login('alpha-owner');
    const missingOrganization = randomUUID();
    const crossTenant = await app.inject({
      headers: { cookie: session.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationB}/memberships`,
    });
    const missing = await app.inject({
      headers: { cookie: session.cookie },
      method: 'GET',
      url: `/v1/organizations/${missingOrganization}/memberships`,
    });
    expect(crossTenant.statusCode).toBe(404);
    expect(crossTenant.json()).toEqual(missing.json());

    const write = await app.inject({
      body: { email: 'person@mergecom.test', role: 'viewer' },
      headers: secureHeaders(session),
      method: 'POST',
      url: `/v1/organizations/${organizationB}/invitations`,
    });
    expect(write.statusCode).toBe(404);
    expect(
      (
        await database.pool.query(
          'select count(*)::int as count from invitations where organization_id = $1',
          [organizationB],
        )
      ).rows[0]?.count,
    ).toBe(0);
  });

  it('denies a suspended membership', async () => {
    const session = await login('alpha-reviewer');
    const response = await app.inject({
      headers: { cookie: session.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/memberships`,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('workspace_access_denied');
  });

  it('rejects expired and replayed invitation tokens', async () => {
    const owner = await login('alpha-owner');
    const expired = await createInvite(owner);
    expect(expired.response.statusCode).toBe(201);
    await database.pool.query(
      `update invitations set expires_at = now() - interval '1 minute'
        where token_hash = $1`,
      [hashToken(expired.token)],
    );
    const invited = await login('alpha-external-reviewer');
    const expiredAcceptance = await app.inject({
      body: { token: expired.token },
      headers: secureHeaders(invited),
      method: 'POST',
      url: '/v1/invitations/accept',
    });
    expect(expiredAcceptance.statusCode).toBe(400);

    const valid = await createInvite(owner);
    const first = await app.inject({
      body: { token: valid.token },
      headers: secureHeaders(invited),
      method: 'POST',
      url: '/v1/invitations/accept',
    });
    const replay = await app.inject({
      body: { token: valid.token },
      headers: secureHeaders(invited),
      method: 'POST',
      url: '/v1/invitations/accept',
    });
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toEqual(expiredAcceptance.json());
  });

  it('prevents an admin from escalating a member to owner', async () => {
    const admin = await login('alpha-admin');
    const response = await app.inject({
      body: { role: 'owner' },
      headers: secureHeaders(admin),
      method: 'PATCH',
      url: `/v1/organizations/${organizationA}/memberships/${viewerMembership}/role`,
    });
    expect(response.statusCode).toBe(403);
    expect(
      (
        await database.pool.query(
          'select role from memberships where id = $1',
          [viewerMembership],
        )
      ).rows[0]?.role,
    ).toBe('viewer');
    expect(
      (
        await database.pool.query(
          `select count(*)::int as count from audit_events
            where action = 'membership.role_change_denied'
              and result = 'denied'`,
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it('changes, suspends, reactivates, and removes membership access', async () => {
    const owner = await login('alpha-owner');
    const viewer = await login('alpha-viewer');
    const invalidCsrf = await app.inject({
      body: { role: 'reviewer' },
      headers: {
        ...secureHeaders(owner),
        'x-csrf-token': 'altered-csrf-token',
      },
      method: 'PATCH',
      url: `/v1/organizations/${organizationA}/memberships/${viewerMembership}/role`,
    });
    expect(invalidCsrf.statusCode).toBe(403);

    const role = await app.inject({
      body: { role: 'reviewer' },
      headers: {
        ...secureHeaders(owner),
        origin: 'https://localhost:5176',
      },
      method: 'PATCH',
      url: `/v1/organizations/${organizationA}/memberships/${viewerMembership}/role`,
    });
    expect(role.statusCode).toBe(204);

    const hostileOrigin = await app.inject({
      body: { role: 'viewer' },
      headers: {
        ...secureHeaders(owner),
        origin: 'https://localhost.attacker.example',
      },
      method: 'PATCH',
      url: `/v1/organizations/${organizationA}/memberships/${viewerMembership}/role`,
    });
    expect(hostileOrigin.statusCode).toBe(403);
    expect(hostileOrigin.json().code).toBe('csrf_rejected');

    const suspend = await app.inject({
      body: { status: 'suspended' },
      headers: secureHeaders(owner),
      method: 'PATCH',
      url: `/v1/organizations/${organizationA}/memberships/${viewerMembership}/status`,
    });
    expect(suspend.statusCode, suspend.payload).toBe(204);
    expect(
      (
        await app.inject({
          headers: { cookie: viewer.cookie },
          method: 'GET',
          url: '/v1/me',
        })
      ).statusCode,
    ).toBe(401);

    const reactivate = await app.inject({
      body: { status: 'active' },
      headers: secureHeaders(owner),
      method: 'PATCH',
      url: `/v1/organizations/${organizationA}/memberships/${viewerMembership}/status`,
    });
    expect(reactivate.statusCode).toBe(204);

    const remove = await app.inject({
      headers: secureHeaders(owner),
      method: 'DELETE',
      url: `/v1/organizations/${organizationA}/memberships/${viewerMembership}`,
    });
    expect(remove.statusCode).toBe(204);
    const actions = await database.pool.query<{ action: string }>(
      `select action from audit_events
        where target_id = $1 and result = 'succeeded' order by occurred_at`,
      [viewerMembership],
    );
    expect(actions.rows.map((event) => event.action)).toEqual([
      'membership.role_changed',
      'membership.suspended',
      'membership.reactivated',
      'membership.removed',
    ]);
  });

  it('revokes sessions on logout and enforces session expiry', async () => {
    const first = await login('alpha-owner');
    const logout = await app.inject({
      headers: secureHeaders(first),
      method: 'POST',
      url: '/auth/logout',
    });
    expect(logout.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          headers: { cookie: first.cookie },
          method: 'GET',
          url: '/v1/me',
        })
      ).statusCode,
    ).toBe(401);

    const second = await login('alpha-owner');
    const handoff = await app.inject({
      headers: {
        ...secureHeaders(second),
        origin: 'https://localhost:5176',
      },
      method: 'POST',
      url: '/auth/office/handoff',
    });
    expect(handoff.statusCode, handoff.payload).toBe(200);
    const handoffCode = handoff.json().code as string;
    expect(handoffCode).toMatch(/^office_handoff_[A-Za-z0-9_-]{43}$/u);
    const unresolvedHandoff = await app.inject({
      headers: { cookie: `mergecom_session=${handoffCode}` },
      method: 'GET',
      url: '/v1/me',
    });
    expect(unresolvedHandoff.statusCode).toBe(401);

    const hostileExchange = await app.inject({
      body: { code: handoffCode },
      headers: { origin: 'https://localhost.attacker.example' },
      method: 'POST',
      url: '/auth/office/exchange',
    });
    expect(hostileExchange.statusCode).toBe(403);

    const exchange = await app.inject({
      body: { code: handoffCode },
      headers: { origin: 'https://localhost:5176' },
      method: 'POST',
      url: '/auth/office/exchange',
    });
    expect(exchange.statusCode, exchange.payload).toBe(200);
    const exchangeSetCookie = exchange.headers['set-cookie'];
    const officeCookie = (
      Array.isArray(exchangeSetCookie)
        ? exchangeSetCookie[0]
        : exchangeSetCookie
    )?.split(';')[0];
    expect(officeCookie).toBeTruthy();
    expect(
      (
        await app.inject({
          headers: { cookie: officeCookie! },
          method: 'GET',
          url: '/v1/me',
        })
      ).statusCode,
    ).toBe(200);

    const replay = await app.inject({
      body: { code: handoffCode },
      headers: { origin: 'https://localhost:5176' },
      method: 'POST',
      url: '/auth/office/exchange',
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().code).toBe('invalid_office_handoff');

    const rawToken = second.cookie.split('=').slice(1).join('=');
    await database.pool.query(
      `update sessions set expires_at = now() - interval '1 minute'
        where token_hash = $1`,
      [hashToken(rawToken)],
    );
    expect(
      (
        await app.inject({
          headers: { cookie: second.cookie },
          method: 'GET',
          url: '/v1/me',
        })
      ).statusCode,
    ).toBe(401);
  });

  it('does not create a session for a disabled mapped identity', async () => {
    await database.pool.query(
      'update users set disabled_at = now() where id = $1',
      [ownerA],
    );
    const now = new Date();
    const session = createSessionMaterial(now, 60_000, 120_000);
    const store = new PostgresIdentityStore(database.pool, 60_000);

    await expect(
      store.authenticateIdentity({
        identity: {
          displayName: 'Alpha Owner',
          email: 'alpha-owner@mergecom.test',
          emailVerified: true,
          issuer: 'https://identity.local.mergecom',
          providerSubject: 'alpha-owner',
          providerTenantId: 'local-development',
        },
        now,
        requestId: randomUUID(),
        session: session.material,
      }),
    ).rejects.toThrow();
    expect(
      (
        await database.pool.query<{ count: number }>(
          'select count(*)::int as count from sessions where user_id = $1',
          [ownerA],
        )
      ).rows[0]?.count,
    ).toBe(0);
  });
});
