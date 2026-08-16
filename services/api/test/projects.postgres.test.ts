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
const organizationA = '11000000-0000-4000-8000-000000000001';
const organizationB = '11000000-0000-4000-8000-000000000002';
const ownerA = '21000000-0000-4000-8000-000000000001';
const leadA = '21000000-0000-4000-8000-000000000002';
const contributorA = '21000000-0000-4000-8000-000000000003';
const reviewerA = '21000000-0000-4000-8000-000000000004';
const viewerA = '21000000-0000-4000-8000-000000000005';
const externalA = '21000000-0000-4000-8000-000000000006';
const ownerB = '21000000-0000-4000-8000-000000000007';
const membershipViewer = '31000000-0000-4000-8000-000000000005';
const projectA = '41000000-0000-4000-8000-000000000001';
const projectRestricted = '41000000-0000-4000-8000-000000000002';
const projectB = '41000000-0000-4000-8000-000000000003';
const folderA = '51000000-0000-4000-8000-000000000001';
const childFolderA = '51000000-0000-4000-8000-000000000002';
const folderRestricted = '51000000-0000-4000-8000-000000000003';

describe.runIf(runInfrastructureTests)('project resource API', () => {
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
        ($1, 'Alpha Advisory', 'alpha-advisory'),
        ($2, 'Beta Capital', 'beta-capital')`,
      [organizationA, organizationB],
    );
    const users = [
      [ownerA, 'Alpha Owner', 'alpha-owner@mergecom.test', 'alpha-owner'],
      [
        leadA,
        'Alpha Lead',
        'alpha-project-lead@mergecom.test',
        'alpha-project-lead',
      ],
      [
        contributorA,
        'Alpha Contributor',
        'alpha-contributor@mergecom.test',
        'alpha-contributor',
      ],
      [
        reviewerA,
        'Alpha Reviewer',
        'alpha-reviewer@mergecom.test',
        'alpha-reviewer',
      ],
      [viewerA, 'Alpha Viewer', 'alpha-viewer@mergecom.test', 'alpha-viewer'],
      [
        externalA,
        'Alpha External',
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
      `insert into memberships
        (id, organization_id, user_id, role, status) values
        ('31000000-0000-4000-8000-000000000001', $1, $2, 'owner', 'active'),
        ('31000000-0000-4000-8000-000000000002', $1, $3, 'project_lead', 'active'),
        ('31000000-0000-4000-8000-000000000003', $1, $4, 'contributor', 'active'),
        ('31000000-0000-4000-8000-000000000004', $1, $5, 'reviewer', 'active'),
        ($6, $1, $7, 'viewer', 'active'),
        ('31000000-0000-4000-8000-000000000006', $1, $8, 'external_reviewer', 'active'),
        ('31000000-0000-4000-8000-000000000007', $9, $10, 'owner', 'active')`,
      [
        organizationA,
        ownerA,
        leadA,
        contributorA,
        reviewerA,
        membershipViewer,
        viewerA,
        externalA,
        organizationB,
        ownerB,
      ],
    );
    await database.pool.query(
      `insert into projects
        (id, organization_id, name, client_name, created_by_user_id) values
        ($1, $2, 'Project Meridian', 'Northstar Holdings', $3),
        ($4, $2, 'Project Restricted', 'Internal', $3),
        ($5, $6, 'Project Aurora', 'Lighthouse Systems', $7)`,
      [
        projectA,
        organizationA,
        ownerA,
        projectRestricted,
        projectB,
        organizationB,
        ownerB,
      ],
    );
    await database.pool.query(
      `insert into project_memberships
        (organization_id, project_id, organization_membership_id, role,
         added_by_user_id) values
        ($1, $2, '31000000-0000-4000-8000-000000000002', 'project_lead', $3),
        ($1, $2, '31000000-0000-4000-8000-000000000003', 'contributor', $3),
        ($1, $2, '31000000-0000-4000-8000-000000000004', 'reviewer', $3),
        ($1, $2, '31000000-0000-4000-8000-000000000006', 'reviewer', $3)`,
      [organizationA, projectA, ownerA],
    );
    await database.pool.query(
      `insert into project_folders
        (id, organization_id, project_id, parent_folder_id, name,
         sort_order, created_by_user_id) values
        ($1, $2, $3, null, 'Financial Analysis', 1000, $4),
        ($5, $2, $3, $1, 'Supporting Schedules', 1000, $4),
        ($6, $2, $7, null, 'Restricted Folder', 1000, $4)`,
      [
        folderA,
        organizationA,
        projectA,
        ownerA,
        childFolderA,
        folderRestricted,
        projectRestricted,
      ],
    );
    await database.pool.query(
      `insert into documents
        (organization_id, project_id, folder_id, name, kind,
         sort_order, created_by_user_id)
       values ($1, $2, $3, 'Operating Model.xlsx', 'spreadsheet', 1000, $4)`,
      [organizationA, projectA, folderA, ownerA],
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
      remoteAddress: `10.0.0.${loginCounter}`,
      url: '/auth/development/session',
    });
    expect(response.statusCode, response.payload).toBe(200);
    const cookie = response.cookies[0]?.name + '=' + response.cookies[0]?.value;
    const me = await app.inject({
      headers: { cookie },
      method: 'GET',
      url: '/v1/me',
    });
    expect(me.statusCode, me.payload).toBe(200);
    return { cookie, csrfToken: me.json().session.csrfToken as string };
  }

  function secureHeaders(
    session: Awaited<ReturnType<typeof login>>,
    idempotencyKey?: string,
  ) {
    return {
      cookie: session.cookie,
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      origin: 'http://localhost:5173',
      'x-csrf-token': session.csrfToken,
    };
  }

  it('shares idempotent project creation across two sessions', async () => {
    const first = await login('alpha-owner');
    const second = await login('alpha-owner');
    const key = randomUUID();
    const create = await app.inject({
      body: { clientName: 'Shared Client', name: 'Project Shared' },
      headers: secureHeaders(first, key),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/projects`,
    });
    expect(create.statusCode, create.payload).toBe(201);
    const replay = await app.inject({
      body: { clientName: 'Shared Client', name: 'Project Shared' },
      headers: secureHeaders(first, key),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/projects`,
    });
    expect(replay.statusCode, replay.payload).toBe(201);
    expect(replay.json().id).toBe(create.json().id);

    const list = await app.inject({
      headers: { cookie: second.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/projects`,
    });
    expect(list.statusCode, list.payload).toBe(200);
    expect(
      list
        .json<{ items: Array<{ id: string }> }>()
        .items.map((project) => project.id),
    ).toContain(create.json().id);

    const changedInput = await app.inject({
      body: { clientName: 'Shared Client', name: 'Project Altered' },
      headers: secureHeaders(first, key),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/projects`,
    });
    expect(changedInput.statusCode).toBe(409);
    expect(changedInput.json().code).toBe('idempotency_conflict');
  });

  it('does not reveal or modify a foreign tenant', async () => {
    const owner = await login('alpha-owner');
    const unknownOrganization = randomUUID();
    const foreign = await app.inject({
      headers: { cookie: owner.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationB}/projects`,
    });
    const unknown = await app.inject({
      headers: { cookie: owner.cookie },
      method: 'GET',
      url: `/v1/organizations/${unknownOrganization}/projects`,
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(unknown.json());

    const write = await app.inject({
      body: { name: 'Foreign Folder' },
      headers: secureHeaders(owner, randomUUID()),
      method: 'POST',
      url: `/v1/organizations/${organizationB}/projects/${projectB}/folders`,
    });
    expect(write.statusCode).toBe(404);
    expect(
      (
        await database.pool.query<{ count: number }>(
          `select count(*)::int as count from project_folders where name = 'Foreign Folder'`,
        )
      ).rows[0]?.count,
    ).toBe(0);
  });

  it('enforces explicit project access and content permissions', async () => {
    const contributor = await login('alpha-contributor');
    const reviewer = await login('alpha-reviewer');
    const external = await login('alpha-external-reviewer');
    const created = await app.inject({
      body: { kind: 'word_document', name: 'Contributor Notes.docx' },
      headers: secureHeaders(contributor, randomUUID()),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/projects/${projectA}/documents`,
    });
    expect(created.statusCode, created.payload).toBe(201);

    const denied = await app.inject({
      body: { kind: 'word_document', name: 'Reviewer Notes.docx' },
      headers: secureHeaders(reviewer, randomUUID()),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/projects/${projectA}/documents`,
    });
    expect(denied.statusCode).toBe(403);

    const assigned = await app.inject({
      headers: { cookie: external.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/projects/${projectA}`,
    });
    const unassigned = await app.inject({
      headers: { cookie: external.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/projects/${projectRestricted}`,
    });
    expect(assigned.statusCode).toBe(200);
    expect(unassigned.statusCode).toBe(404);
  });

  it('caps project team roles at organization membership roles', async () => {
    const lead = await login('alpha-project-lead');
    const tooHigh = await app.inject({
      body: {
        organizationMembershipId: membershipViewer,
        role: 'project_lead',
      },
      headers: secureHeaders(lead),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/projects/${projectA}/team`,
    });
    expect(tooHigh.statusCode).toBe(409);
    expect(tooHigh.json().code).toBe('role_exceeds_organization');

    const added = await app.inject({
      body: { organizationMembershipId: membershipViewer, role: 'viewer' },
      headers: secureHeaders(lead),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/projects/${projectA}/team`,
    });
    expect(added.statusCode, added.payload).toBe(201);
    const escalation = await app.inject({
      body: { role: 'reviewer' },
      headers: secureHeaders(lead),
      method: 'PATCH',
      url: `/v1/organizations/${organizationA}/projects/${projectA}/team/${added.json().id}`,
    });
    expect(escalation.statusCode).toBe(409);
    const removed = await app.inject({
      headers: secureHeaders(lead),
      method: 'DELETE',
      url: `/v1/organizations/${organizationA}/projects/${projectA}/team/${added.json().id}`,
    });
    expect(removed.statusCode).toBe(204);
  });

  it('accepts a project-scoped invitation transactionally', async () => {
    const owner = await login('alpha-owner');
    await database.pool.query(
      `delete from project_memberships
        where organization_membership_id = '31000000-0000-4000-8000-000000000006'`,
    );
    await database.pool.query(
      `delete from memberships
        where id = '31000000-0000-4000-8000-000000000006'`,
    );
    const invitation = await app.inject({
      body: {
        email: 'alpha-external-reviewer@mergecom.test',
        projectId: projectA,
        projectRole: 'reviewer',
        role: 'external_reviewer',
      },
      headers: secureHeaders(owner),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/invitations`,
    });
    expect(invitation.statusCode, invitation.payload).toBe(201);
    const acceptanceUrl = new URL(invitation.json().acceptanceUrl as string);
    const token = decodeURIComponent(acceptanceUrl.pathname.split('/').at(-1)!);
    const external = await login('alpha-external-reviewer');
    const accepted = await app.inject({
      body: { token },
      headers: secureHeaders(external),
      method: 'POST',
      url: '/v1/invitations/accept',
    });
    expect(accepted.statusCode, accepted.payload).toBe(200);
    const project = await app.inject({
      headers: { cookie: external.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/projects/${projectA}`,
    });
    expect(project.statusCode, project.payload).toBe(200);
    expect(project.json().accessRole).toBe('reviewer');
  });

  it('rejects folder cycles and cross-project folder moves', async () => {
    const owner = await login('alpha-owner');
    const folder = await database.pool.query<{ updated_at: Date }>(
      'select updated_at from project_folders where id = $1',
      [folderA],
    );
    const cycle = await app.inject({
      body: {
        expectedUpdatedAt: folder.rows[0]!.updated_at.toISOString(),
        parentFolderId: childFolderA,
      },
      headers: secureHeaders(owner),
      method: 'PATCH',
      url: `/v1/organizations/${organizationA}/projects/${projectA}/folders/${folderA}`,
    });
    expect(cycle.statusCode).toBe(409);
    expect(cycle.json().code).toBe('invalid_parent');

    const child = await database.pool.query<{ updated_at: Date }>(
      'select updated_at from project_folders where id = $1',
      [childFolderA],
    );
    const crossProject = await app.inject({
      body: {
        expectedUpdatedAt: child.rows[0]!.updated_at.toISOString(),
        parentFolderId: folderRestricted,
      },
      headers: secureHeaders(owner),
      method: 'PATCH',
      url: `/v1/organizations/${organizationA}/projects/${projectA}/folders/${childFolderA}`,
    });
    expect(crossProject.statusCode).toBe(409);
    expect(crossProject.json().code).toBe('invalid_parent');
  });

  it('allows exactly one simultaneous rename for the same base state', async () => {
    const owner = await login('alpha-owner');
    const current = await app.inject({
      headers: { cookie: owner.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/projects/${projectA}`,
    });
    const expectedUpdatedAt = current.json().updatedAt as string;
    const responses = await Promise.all(
      ['Project Meridian One', 'Project Meridian Two'].map((name) =>
        app.inject({
          body: { expectedUpdatedAt, name },
          headers: secureHeaders(owner),
          method: 'PATCH',
          url: `/v1/organizations/${organizationA}/projects/${projectA}`,
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
  });

  it('archives, restores, and soft-deletes projects with audit events', async () => {
    const owner = await login('alpha-owner');
    const current = await app.inject({
      headers: { cookie: owner.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/projects/${projectRestricted}`,
    });
    const archived = await app.inject({
      body: { expectedUpdatedAt: current.json().updatedAt },
      headers: secureHeaders(owner),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/projects/${projectRestricted}/archive`,
    });
    expect(archived.statusCode, archived.payload).toBe(200);
    const restored = await app.inject({
      body: { expectedUpdatedAt: archived.json().updatedAt },
      headers: secureHeaders(owner),
      method: 'POST',
      url: `/v1/organizations/${organizationA}/projects/${projectRestricted}/restore`,
    });
    expect(restored.statusCode, restored.payload).toBe(200);
    const removed = await app.inject({
      headers: secureHeaders(owner),
      method: 'DELETE',
      url: `/v1/organizations/${organizationA}/projects/${projectRestricted}?expectedUpdatedAt=${encodeURIComponent(restored.json().updatedAt as string)}`,
    });
    expect(removed.statusCode, removed.payload).toBe(204);
    const missing = await app.inject({
      headers: { cookie: owner.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/projects/${projectRestricted}`,
    });
    expect(missing.statusCode).toBe(404);
    const audit = await database.pool.query<{ action: string }>(
      `select action from audit_events
        where target_id = $1 and result = 'succeeded' order by occurred_at`,
      [projectRestricted],
    );
    expect(audit.rows.map((event) => event.action)).toEqual([
      'project.archived',
      'project.restored',
      'project.deleted',
    ]);
  });

  it('returns stable cursor pages without duplicates', async () => {
    const owner = await login('alpha-owner');
    const first = await app.inject({
      headers: { cookie: owner.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/projects?limit=1`,
    });
    expect(first.statusCode, first.payload).toBe(200);
    expect(first.json().items).toHaveLength(1);
    expect(first.json().nextCursor).toBeTypeOf('string');
    const second = await app.inject({
      headers: { cookie: owner.cookie },
      method: 'GET',
      url: `/v1/organizations/${organizationA}/projects?limit=1&cursor=${encodeURIComponent(first.json().nextCursor as string)}`,
    });
    expect(second.statusCode, second.payload).toBe(200);
    expect(second.json().items[0].id).not.toBe(first.json().items[0].id);
  });
});
