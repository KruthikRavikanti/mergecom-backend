import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { ApiConfig } from '../src/config';
import { createDatabase, type DatabaseContext } from '../src/db/database';

const suppliedDatabaseUrl = process.env.TEST_DATABASE_URL;
const runInfrastructureTests =
  process.env.RUN_TESTCONTAINERS === 'true' || Boolean(suppliedDatabaseUrl);
const organizationA = '19000000-0000-4000-8000-000000000001';
const organizationB = '19000000-0000-4000-8000-000000000002';
const reviewerA = '29000000-0000-4000-8000-000000000001';
const ownerA = '29000000-0000-4000-8000-000000000002';
const unverifiedA = '29000000-0000-4000-8000-000000000003';
const ownerB = '29000000-0000-4000-8000-000000000004';

describe.runIf(runInfrastructureTests)('notification API', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
  let database: DatabaseContext;
  let loginCounter = 0;

  const config = (databaseUrl: string): ApiConfig => ({
    apiPublicOrigin: 'http://localhost:3001',
    authMode: 'development',
    cookieSecure: false,
    databaseUrl,
    exposeInvitationLinks: true,
    invitationMail: null,
    nodeEnv: 'test',
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
    app = await createApp({ config: config(databaseUrl), databaseUrl });
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
        ($1, 'Alpha Advisory', 'alpha-notifications'),
        ($2, 'Beta Capital', 'beta-notifications')`,
      [organizationA, organizationB],
    );
    const users = [
      [reviewerA, 'Alpha Reviewer', 'alpha-reviewer@mergecom.test', true],
      [ownerA, 'Alpha Owner', 'alpha-owner@mergecom.test', true],
      [
        unverifiedA,
        'Unverified Reviewer',
        'alpha-external-reviewer@mergecom.test',
        false,
      ],
      [ownerB, 'Beta Owner', 'beta-owner@mergecom.test', true],
    ] as const;
    for (const [id, name, email, verified] of users) {
      await database.pool.query(
        `insert into users
          (id, display_name, primary_email, email_verified)
         values ($1, $2, $3, $4)`,
        [id, name, email, verified],
      );
      await database.pool.query(
        `insert into identity_mappings
          (user_id, issuer, provider_tenant_id, provider_subject,
           email_claim, email_verified)
         values ($1, 'https://identity.local.mergecom',
                 'local-development', $2, $3, $4)`,
        [id, email.split('@')[0], email, verified],
      );
    }
    await database.pool.query(
      `insert into memberships
        (id, organization_id, user_id, role, status) values
        ('39000000-0000-4000-8000-000000000001', $1, $2, 'reviewer', 'active'),
        ('39000000-0000-4000-8000-000000000002', $1, $3, 'owner', 'active'),
        ('39000000-0000-4000-8000-000000000003', $1, $4, 'reviewer', 'active'),
        ('39000000-0000-4000-8000-000000000004', $5, $6, 'owner', 'active')`,
      [organizationA, reviewerA, ownerA, unverifiedA, organizationB, ownerB],
    );
  });

  afterAll(async () => {
    await app.close();
    await database.close();
    await container?.stop();
  });

  async function login(identity: string) {
    loginCounter += 1;
    const response = await app.inject({
      body: { identity },
      method: 'POST',
      remoteAddress: `10.90.0.${loginCounter}`,
      url: '/auth/development/session',
    });
    expect(response.statusCode, response.payload).toBe(200);
    const cookie = `${response.cookies[0]?.name}=${response.cookies[0]?.value}`;
    const me = await app.inject({
      headers: { cookie },
      method: 'GET',
      url: '/v1/me',
    });
    expect(me.statusCode, me.payload).toBe(200);
    return { cookie, csrf: me.json().session.csrfToken as string };
  }

  function secureHeaders(session: { cookie: string; csrf: string }) {
    return {
      cookie: session.cookie,
      origin: 'http://localhost:5173',
      'x-csrf-token': session.csrf,
    };
  }

  async function insertNotification(input: {
    createdAt: string;
    recipientUserId: string;
    title: string;
  }) {
    const sourceEventId = randomUUID();
    const notificationId = randomUUID();
    await database.pool.query(
      `insert into outbox_events
        (id, organization_id, aggregate_type, aggregate_id, event_type,
         payload, status, published_at, created_at)
       values ($1, $2, 'review_request', $3, 'review.requested', '{}',
               'published', now(), $4)`,
      [sourceEventId, organizationA, randomUUID(), input.createdAt],
    );
    await database.pool.query(
      `insert into user_notifications
        (id, organization_id, recipient_user_id, source_event_id, category,
         event_type, title, body, href, created_at)
       values ($1, $2, $3, $4, 'review_activity', 'review.requested', $5,
               'A document version is waiting for your review.',
               '/app/projects/49000000-0000-4000-8000-000000000001/documents/69000000-0000-4000-8000-000000000001/history/reviews/79000000-0000-4000-8000-000000000001',
               $6)`,
      [
        notificationId,
        organizationA,
        input.recipientUserId,
        sourceEventId,
        input.title,
        input.createdAt,
      ],
    );
    await database.pool.query(
      `insert into notification_deliveries
        (organization_id, notification_id, channel, status, completed_at)
       values ($1, $2, 'in_app', 'completed', now())`,
      [organizationA, notificationId],
    );
    return notificationId;
  }

  it('persists channel preferences and audits the update', async () => {
    const reviewer = await login('alpha-reviewer');
    const initial = await app.inject({
      headers: { cookie: reviewer.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/notifications/preferences`,
    });
    expect(initial.statusCode, initial.payload).toBe(200);
    expect(initial.json()).toMatchObject({
      emailAvailable: true,
      emailDocumentActivity: false,
      emailReviewActivity: false,
      inAppDocumentActivity: true,
      inAppReviewActivity: true,
    });

    const updated = await app.inject({
      body: {
        emailDocumentActivity: true,
        emailReviewActivity: true,
        inAppDocumentActivity: false,
        inAppReviewActivity: true,
      },
      headers: secureHeaders(reviewer),
      method: 'PUT',
      url: `/v1/organizations/${organizationA}/notifications/preferences`,
    });
    expect(updated.statusCode, updated.payload).toBe(200);
    expect(updated.json()).toMatchObject({
      emailDocumentActivity: true,
      emailReviewActivity: true,
      inAppDocumentActivity: false,
      inAppReviewActivity: true,
    });
    const audit = await database.pool.query<{ action: string }>(
      `select action from audit_events where actor_user_id = $1
        and action = 'notification.preferences_updated'`,
      [reviewerA],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('rejects email delivery for an unverified address without persisting it', async () => {
    const reviewer = await login('alpha-external-reviewer');
    const response = await app.inject({
      body: {
        emailDocumentActivity: false,
        emailReviewActivity: true,
        inAppDocumentActivity: true,
        inAppReviewActivity: true,
      },
      headers: secureHeaders(reviewer),
      method: 'PUT',
      url: `/v1/organizations/${organizationA}/notifications/preferences`,
    });
    expect(response.statusCode, response.payload).toBe(409);
    expect(response.json().code).toBe('email_unverified');
    const stored = await database.pool.query<{ count: number }>(
      `select count(*)::int as count from notification_preferences
        where organization_id = $1 and user_id = $2`,
      [organizationA, unverifiedA],
    );
    expect(stored.rows[0]?.count).toBe(0);
  });

  it('paginates the recipient inbox and keeps read state tenant-scoped', async () => {
    const firstId = await insertNotification({
      createdAt: '2026-08-16T12:00:00.000Z',
      recipientUserId: reviewerA,
      title: 'Old review',
    });
    await insertNotification({
      createdAt: '2026-08-16T13:00:00.000Z',
      recipientUserId: reviewerA,
      title: 'Middle review',
    });
    await insertNotification({
      createdAt: '2026-08-16T14:00:00.000Z',
      recipientUserId: reviewerA,
      title: 'New review',
    });
    const ownerNotificationId = await insertNotification({
      createdAt: '2026-08-16T15:00:00.000Z',
      recipientUserId: ownerA,
      title: 'Owner review',
    });
    const reviewer = await login('alpha-reviewer');
    const firstPage = await app.inject({
      headers: { cookie: reviewer.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/notifications?limit=2`,
    });
    expect(firstPage.statusCode, firstPage.payload).toBe(200);
    const firstPageBody = firstPage.json<{
      items: Array<{ id: string; title: string }>;
      nextCursor: string | null;
      unreadCount: number;
    }>();
    expect(firstPageBody.items.map((item) => item.title)).toEqual([
      'New review',
      'Middle review',
    ]);
    expect(firstPageBody).toMatchObject({ unreadCount: 3 });
    expect(firstPageBody.items[0]).not.toHaveProperty('sourceEventId');
    expect(firstPageBody.items[0]).not.toHaveProperty('recipientAddress');
    expect(firstPageBody.nextCursor).not.toBeNull();

    const secondPage = await app.inject({
      headers: { cookie: reviewer.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/notifications?limit=2&cursor=${encodeURIComponent(firstPageBody.nextCursor!)}`,
    });
    expect(secondPage.statusCode, secondPage.payload).toBe(200);
    expect(secondPage.json().items).toHaveLength(1);
    expect(secondPage.json().items[0].id).toBe(firstId);

    const foreignRead = await app.inject({
      headers: secureHeaders(reviewer),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/notifications/${ownerNotificationId}/read`,
    });
    expect(foreignRead.statusCode).toBe(404);

    const readAll = await app.inject({
      headers: secureHeaders(reviewer),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/notifications/read-all`,
    });
    expect(readAll.statusCode, readAll.payload).toBe(200);
    expect(readAll.json()).toEqual({ updatedCount: 3 });
    const unread = await app.inject({
      headers: { cookie: reviewer.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/notifications?unreadOnly=true`,
    });
    expect(unread.json()).toMatchObject({ items: [], unreadCount: 0 });
  });

  it('returns the same not-found boundary for another tenant and rejects bad cursors', async () => {
    const reviewer = await login('alpha-reviewer');
    const crossTenant = await app.inject({
      headers: { cookie: reviewer.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationB}/notifications`,
    });
    const missingTenant = await app.inject({
      headers: { cookie: reviewer.cookie },
      method: 'GET',
      url: `/v1/organizations/${randomUUID()}/notifications`,
    });
    expect(crossTenant.statusCode).toBe(404);
    expect(crossTenant.json()).toEqual(missingTenant.json());

    const invalidCursor = await app.inject({
      headers: { cookie: reviewer.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/notifications?cursor=invalid`,
    });
    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json().code).toBe('invalid_cursor');
  });
});
