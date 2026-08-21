import { createHash, randomUUID } from 'node:crypto';

import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { ApiConfig, BlobStorageConfig } from '../src/config';
import { createDatabase, type DatabaseContext } from '../src/db/database';
import { S3BlobStore } from '../src/storage/s3-blob-store';
import { PostgresVersionStore } from '../src/versions/postgres-store';
import { VersionService } from '../src/versions/service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const s3Endpoint = process.env.TEST_S3_ENDPOINT;
const runInfrastructureTests = Boolean(databaseUrl && s3Endpoint);
const bucket = process.env.TEST_S3_BUCKET ?? 'mergecom-phase4-tests';
const organizationA = '12000000-0000-4000-8000-000000000001';
const organizationB = '12000000-0000-4000-8000-000000000002';
const ownerA = '22000000-0000-4000-8000-000000000001';
const contributorA = '22000000-0000-4000-8000-000000000002';
const viewerA = '22000000-0000-4000-8000-000000000003';
const ownerB = '22000000-0000-4000-8000-000000000004';
const reviewerA = '22000000-0000-4000-8000-000000000005';
const projectA = '42000000-0000-4000-8000-000000000001';
const projectRestricted = '42000000-0000-4000-8000-000000000002';
const documentA = '62000000-0000-4000-8000-000000000001';
const documentRestricted = '62000000-0000-4000-8000-000000000002';

interface TestIntent {
  grant: { headers: Record<string, string>; url: string } | null;
  id: string;
  mode: 'multipart' | 'single';
  multipart: { partCount: number; partSize: number } | null;
}

interface TestVersion {
  artifact: { id: string; sha256: string };
  id: string;
}

const storageConfig: BlobStorageConfig = {
  accessKey: process.env.TEST_S3_ACCESS_KEY ?? 'mergecom-local',
  bucket,
  cleanupIntervalMilliseconds: 60 * 60 * 1000,
  endpoint: s3Endpoint ?? 'http://127.0.0.1:9000',
  forcePathStyle: true,
  maxUploadBytes: 20 * 1024 * 1024,
  multipartPartBytes: 5 * 1024 * 1024,
  multipartThresholdBytes: 5 * 1024 * 1024,
  organizationQuotaBytes: 100 * 1024 * 1024,
  region: 'us-east-1',
  secretKey: process.env.TEST_S3_SECRET_KEY ?? 'mergecom-local-only',
  signedUrlSeconds: 5,
};

const s3Client = new S3Client({
  credentials: {
    accessKeyId: storageConfig.accessKey,
    secretAccessKey: storageConfig.secretKey,
  },
  endpoint: storageConfig.endpoint,
  forcePathStyle: true,
  region: storageConfig.region,
});

function config(): ApiConfig {
  return {
    apiPublicOrigin: 'http://localhost:3001',
    authMode: 'development',
    blobStorage: storageConfig,
    cookieSecure: false,
    databaseUrl: databaseUrl!,
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
  };
}

function officeBytes(label: string, size?: number): Uint8Array {
  const prefix = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
  const content = new TextEncoder().encode(label);
  const result = new Uint8Array(size ?? prefix.length + content.length);
  result.set(prefix);
  for (let offset = prefix.length; offset < result.length; offset += 1) {
    result[offset] = content[(offset - prefix.length) % content.length] ?? 0;
  }
  return result;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe.runIf(runInfrastructureTests)(
  'immutable artifact and version API',
  () => {
    let app: Awaited<ReturnType<typeof createApp>>;
    let database: DatabaseContext;
    let loginCounter = 0;

    beforeAll(async () => {
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (status !== 409) throw error;
      }
      database = createDatabase(databaseUrl!);
      await migrate(database.db, { migrationsFolder: 'drizzle' });
      app = await createApp({ config: config(), databaseUrl });
      await app.ready();
    }, 120_000);

    beforeEach(async () => {
      const listed = await s3Client.send(
        new ListObjectsV2Command({ Bucket: bucket }),
      );
      if (listed.Contents?.length) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: listed.Contents.flatMap((item) =>
                item.Key ? [{ Key: item.Key }] : [],
              ),
            },
          }),
        );
      }
      await database.pool.query(
        `truncate audit_events, sessions, invitations, memberships,
                identity_mappings, organization_identity_policies,
                organization_bootstrap_grants, oidc_transactions,
                users, organizations restart identity cascade`,
      );
      await database.pool.query(
        `insert into organizations (id, name, slug) values
        ($1, 'Alpha Advisory', 'alpha-version-tests'),
        ($2, 'Beta Capital', 'beta-version-tests')`,
        [organizationA, organizationB],
      );
      const users = [
        [ownerA, 'Alpha Owner', 'alpha-owner@mergecom.test', 'alpha-owner'],
        [
          contributorA,
          'Alpha Contributor',
          'alpha-contributor@mergecom.test',
          'alpha-contributor',
        ],
        [viewerA, 'Alpha Viewer', 'alpha-viewer@mergecom.test', 'alpha-viewer'],
        [ownerB, 'Beta Owner', 'beta-owner@mergecom.test', 'beta-owner'],
        [
          reviewerA,
          'Alpha Reviewer',
          'alpha-reviewer@mergecom.test',
          'alpha-reviewer',
        ],
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
        ('32000000-0000-4000-8000-000000000001', $1, $2, 'owner', 'active'),
        ('32000000-0000-4000-8000-000000000002', $1, $3, 'contributor', 'active'),
        ('32000000-0000-4000-8000-000000000003', $1, $4, 'viewer', 'active'),
        ('32000000-0000-4000-8000-000000000004', $5, $6, 'owner', 'active'),
        ('32000000-0000-4000-8000-000000000005', $1, $7, 'reviewer', 'active')`,
        [
          organizationA,
          ownerA,
          contributorA,
          viewerA,
          organizationB,
          ownerB,
          reviewerA,
        ],
      );
      await database.pool.query(
        `insert into projects
        (id, organization_id, name, created_by_user_id) values
        ($1, $2, 'Project Meridian', $3),
        ($4, $2, 'Project Restricted', $3)`,
        [projectA, organizationA, ownerA, projectRestricted],
      );
      await database.pool.query(
        `insert into project_memberships
        (organization_id, project_id, organization_membership_id, role,
         added_by_user_id)
       values ($1, $2, '32000000-0000-4000-8000-000000000002',
               'contributor', $3),
              ($1, $2, '32000000-0000-4000-8000-000000000001',
               'project_lead', $3),
              ($1, $2, '32000000-0000-4000-8000-000000000005',
               'reviewer', $3)`,
        [organizationA, projectA, ownerA],
      );
      await database.pool.query(
        `insert into documents
        (id, organization_id, project_id, name, kind, created_by_user_id)
       values ($1, $2, $3, 'Board Review.pptx', 'presentation', $4),
              ($5, $2, $6, 'Restricted.pptx', 'presentation', $4)`,
        [
          documentA,
          organizationA,
          projectA,
          ownerA,
          documentRestricted,
          projectRestricted,
        ],
      );
      await database.pool.query(
        `insert into document_branches
        (organization_id, document_id, name, is_default, created_by_user_id)
       values ($1, $2, 'main', true, $3),
              ($1, $4, 'main', true, $3)`,
        [organizationA, documentA, ownerA, documentRestricted],
      );
    });

    afterAll(async () => {
      await app.close();
      await database.close();
    });

    async function login(identity: string) {
      loginCounter += 1;
      const response = await app.inject({
        body: { identity },
        method: 'POST',
        remoteAddress: `10.20.0.${loginCounter}`,
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
      return { cookie, csrfToken: me.json().session.csrfToken as string };
    }

    function headers(session: Awaited<ReturnType<typeof login>>, key?: string) {
      return {
        cookie: session.cookie,
        ...(key ? { 'idempotency-key': key } : {}),
        origin: 'http://localhost:5173',
        'x-csrf-token': session.csrfToken,
      };
    }

    function base(documentId = documentA, projectId = projectA) {
      return `/v1/organizations/${organizationA}/projects/${projectId}/documents/${documentId}`;
    }

    async function createIntent(
      session: Awaited<ReturnType<typeof login>>,
      bytes: Uint8Array,
      baseVersionId: string | null,
      options: {
        expectedSha256?: string;
        filename?: string;
        idempotencyKey?: string;
      } = {},
    ) {
      const response = await app.inject({
        body: {
          baseVersionId,
          byteSize: bytes.byteLength,
          clientMediaType: 'text/plain',
          filename: options.filename ?? 'Board Review.pptx',
          sha256: options.expectedSha256 ?? sha256(bytes),
        },
        headers: headers(session, options.idempotencyKey ?? randomUUID()),
        method: 'POST',
        url: `${base()}/uploads`,
      });
      expect(response.statusCode, response.payload).toBe(201);
      return response.json<TestIntent>();
    }

    async function put(
      url: string,
      bytes: Uint8Array,
      requestHeaders: Record<string, string> = {},
    ) {
      return fetch(url, {
        body: bytes.slice().buffer,
        headers: requestHeaders,
        method: 'PUT',
      });
    }

    async function uploadSingle(
      intent: Awaited<ReturnType<typeof createIntent>>,
      bytes: Uint8Array,
    ) {
      expect(intent.mode).toBe('single');
      expect(intent.grant).not.toBeNull();
      const response = await put(
        intent.grant!.url,
        bytes,
        intent.grant!.headers,
      );
      expect(response.status).toBe(200);
    }

    async function finalize(
      session: Awaited<ReturnType<typeof login>>,
      uploadId: string,
      note: string,
      key = randomUUID(),
    ) {
      return app.inject({
        body: { note, source: 'web_upload' },
        headers: headers(session, key),
        method: 'POST',
        url: `${base()}/uploads/${uploadId}/finalize`,
      });
    }

    async function push(
      session: Awaited<ReturnType<typeof login>>,
      bytes: Uint8Array,
      baseVersionId: string | null,
      note: string,
    ) {
      const intent = await createIntent(session, bytes, baseVersionId);
      await uploadSingle(intent, bytes);
      const response = await finalize(session, intent.id, note);
      return { intent, response };
    }

    async function markVersionsProcessed(versionIds: string[]) {
      await database.pool.query(
        `update version_processing_jobs
            set status = 'completed', completed_at = now(), updated_at = now()
          where version_id = any($1::uuid[])`,
        [versionIds],
      );
      await database.pool.query(
        `update document_versions set status = 'ready'
          where id = any($1::uuid[])`,
        [versionIds],
      );
      await database.pool.query(
        `update artifacts set scan_status = 'clean'
          where id in (
            select artifact_id from document_versions
             where id = any($1::uuid[])
          )`,
        [versionIds],
      );
    }

    it('round-trips exact bytes, preserves stale work, replays finalize, and restores by appending', async () => {
      const owner = await login('alpha-owner');
      const v1Bytes = officeBytes('version-one-exact');
      const v2Bytes = officeBytes('version-two-exact');
      const staleBytes = officeBytes('stale-version-exact');
      const intentKey = randomUUID();
      const v1Intent = await createIntent(owner, v1Bytes, null, {
        idempotencyKey: intentKey,
      });
      const intentReplay = await app.inject({
        body: {
          baseVersionId: null,
          byteSize: v1Bytes.byteLength,
          clientMediaType: 'text/plain',
          filename: 'Board Review.pptx',
          sha256: sha256(v1Bytes),
        },
        headers: headers(owner, intentKey),
        method: 'POST',
        url: `${base()}/uploads`,
      });
      expect(intentReplay.statusCode, intentReplay.payload).toBe(200);
      expect(intentReplay.json().id).toBe(v1Intent.id);
      await uploadSingle(v1Intent, v1Bytes);
      const v1Response = await finalize(owner, v1Intent.id, 'Initial version');
      const v1Push = { intent: v1Intent, response: v1Response };
      expect(v1Push.response.statusCode, v1Push.response.payload).toBe(201);
      const v1 = v1Push.response.json<{ version: TestVersion }>().version;

      const replayKey = randomUUID();
      const firstReplay = await finalize(
        owner,
        v1Push.intent.id,
        'Initial version',
        replayKey,
      );
      const secondReplay = await finalize(
        owner,
        v1Push.intent.id,
        'Initial version',
        replayKey,
      );
      expect(firstReplay.statusCode).toBe(200);
      expect(secondReplay.statusCode).toBe(200);
      expect(firstReplay.json().version.id).toBe(v1.id);
      expect(secondReplay.json().version.id).toBe(v1.id);

      const v2Push = await push(owner, v2Bytes, v1.id, 'Current team update');
      expect(v2Push.response.statusCode, v2Push.response.payload).toBe(201);
      const v2 = v2Push.response.json<{ version: TestVersion }>().version;
      const stalePush = await push(
        owner,
        staleBytes,
        v1.id,
        'Work from old base',
      );
      expect(stalePush.response.statusCode, stalePush.response.payload).toBe(
        409,
      );
      expect(stalePush.response.json()).toMatchObject({
        currentHeadVersionId: v2.id,
        outcome: 'conflict',
        version: {
          baseVersionId: v1.id,
          parentVersionId: v1.id,
          status: 'conflicted',
        },
      });

      const download = await app.inject({
        headers: headers(owner),
        method: 'POST',
        url: `${base()}/versions/${v1.id}/download`,
      });
      expect(download.statusCode, download.payload).toBe(200);
      const downloaded = new Uint8Array(
        await (await fetch(download.json().url as string)).arrayBuffer(),
      );
      expect(downloaded).toEqual(v1Bytes);
      expect(sha256(downloaded)).toBe(download.json().sha256);

      const restore = await app.inject({
        body: {
          expectedHeadVersionId: v2.id,
          note: 'Restore the original package',
        },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/versions/${v1.id}/restore`,
      });
      expect(restore.statusCode, restore.payload).toBe(201);
      expect(restore.json()).toMatchObject({
        artifact: { id: v1.artifact.id, sha256: sha256(v1Bytes) },
        displayNumber: 4,
        parentVersionId: v2.id,
        source: 'restore',
      });
      const restoredDownload = await app.inject({
        headers: headers(owner),
        method: 'POST',
        url: `${base()}/versions/${restore.json().id}/download`,
      });
      const restoredBytes = new Uint8Array(
        await (
          await fetch(restoredDownload.json().url as string)
        ).arrayBuffer(),
      );
      expect(restoredBytes).toEqual(v1Bytes);
      expect(sha256(restoredBytes)).toBe(restoredDownload.json().sha256);

      const graph = await app.inject({
        headers: { cookie: owner.cookie },
        method: 'GET',
        url: `${base()}/versions?limit=2`,
      });
      expect(graph.statusCode, graph.payload).toBe(200);
      expect(graph.json().items).toHaveLength(2);
      expect(graph.json().nextCursor).toEqual(expect.any(String));
      const counts = await database.pool.query<{
        artifacts: number;
        jobs: number;
        outbox: number;
        versions: number;
      }>(
        `select
        (select count(*)::int from artifacts) as artifacts,
        (select count(*)::int from document_versions) as versions,
        (select count(*)::int from version_processing_jobs) as jobs,
        (select count(*)::int from outbox_events) as outbox`,
      );
      expect(counts.rows[0]).toEqual({
        artifacts: 3,
        jobs: 4,
        outbox: 4,
        versions: 4,
      });
      const leakedGrant = await database.pool.query(
        `select 1 from audit_events where metadata::text like '%X-Amz-%'`,
      );
      expect(leakedGrant.rowCount).toBe(0);
    });

    it('creates one authorized directional comparison and replays it idempotently', async () => {
      const owner = await login('alpha-owner');
      const viewer = await login('alpha-viewer');
      const first = await push(owner, officeBytes('compare-one'), null, 'Base');
      const baseVersionId = first.response.json().version.id as string;
      const second = await push(
        owner,
        officeBytes('compare-two'),
        baseVersionId,
        'Target',
      );
      const targetVersionId = second.response.json().version.id as string;
      await markVersionsProcessed([baseVersionId, targetVersionId]);
      const idempotencyKey = randomUUID();
      const create = await app.inject({
        body: { baseVersionId, targetVersionId },
        headers: headers(owner, idempotencyKey),
        method: 'POST',
        url: `${base()}/comparisons`,
      });
      expect(create.statusCode, create.payload).toBe(201);
      expect(create.json()).toMatchObject({
        baseVersion: { id: baseVersionId },
        changes: [],
        comparisonSchemaVersion: '1.0.0',
        parserVersion: '1.2.0',
        state: 'queued',
        targetVersion: { id: targetVersionId },
      });

      const replay = await app.inject({
        body: { baseVersionId, targetVersionId },
        headers: headers(owner, idempotencyKey),
        method: 'POST',
        url: `${base()}/comparisons`,
      });
      expect(replay.statusCode, replay.payload).toBe(200);
      expect(replay.json().id).toBe(create.json().id);

      const read = await app.inject({
        headers: { cookie: owner.cookie },
        method: 'GET',
        url: `${base()}/comparisons/${create.json().id as string}`,
      });
      expect(read.statusCode, read.payload).toBe(200);
      const viewerEvent = await app.inject({
        body: { durationMilliseconds: 1250, outcome: 'loaded' },
        headers: headers(owner),
        method: 'POST',
        url: `${base()}/comparisons/${create.json().id as string}/viewer-events`,
      });
      expect(viewerEvent.statusCode, viewerEvent.payload).toBe(204);
      const metrics = await app.inject({ method: 'GET', url: '/metrics' });
      expect(metrics.payload).toContain(
        'mergecom_visual_viewer_load_seconds_count 1',
      );
      const denied = await app.inject({
        headers: { cookie: viewer.cookie },
        method: 'GET',
        url: `${base()}/comparisons/${create.json().id as string}`,
      });
      expect(denied.statusCode).toBe(404);

      const unavailable = await app.inject({
        body: {
          baseVersionId,
          targetVersionId: baseVersionId,
        },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/comparisons`,
      });
      expect(unavailable.statusCode).toBe(409);
      expect(unavailable.json().code).toBe('comparison_unavailable');
      const comparisonId = create.json().id as string;
      const changeId = 'd'.repeat(64);
      await database.pool.query(
        `update version_comparisons
            set status = 'completed', completed_at = now(),
                result_object_key = $2, result_sha256 = $3, stable_hash = $4,
                byte_equal = false, semantic_equal = false,
                completeness = 'partial', summary = $5, changes = $6,
                warnings = $7, updated_at = now()
          where id = $1`,
        [
          comparisonId,
          `organizations/${organizationA}/comparisons/${comparisonId}/result.json`,
          'b'.repeat(64),
          'c'.repeat(64),
          JSON.stringify({ content: 1, modified: 1, total: 1 }),
          JSON.stringify([
            {
              after: 'Annual operating review',
              before: 'Private quarterly operating review',
              category: 'content',
              changeType: 'modified',
              entityType: 'paragraph',
              id: changeId,
              impact: 'medium',
              label: 'Paragraph',
              path: '/body/p/1',
            },
          ]),
          JSON.stringify(['Unsupported package feature']),
        ],
      );

      const summaryUrl = `${base()}/comparisons/${comparisonId}/summary`;
      const summary = await app.inject({
        headers: { cookie: owner.cookie },
        method: 'GET',
        url: summaryUrl,
      });
      expect(summary.statusCode, summary.payload).toBe(200);
      expect(summary.json()).toMatchObject({
        comparisonId,
        schemaVersion: '1.0.0',
        substantive: 1,
        totalChanges: 1,
      });
      const replayedSummary = await app.inject({
        headers: { cookie: owner.cookie },
        method: 'GET',
        url: summaryUrl,
      });
      expect(replayedSummary.json()).toEqual(summary.json());
      const deniedSummary = await app.inject({
        headers: { cookie: viewer.cookie },
        method: 'GET',
        url: summaryUrl,
      });
      expect(deniedSummary.statusCode).toBe(404);

      const aiDisabled = await app.inject({
        headers: { cookie: owner.cookie },
        method: 'GET',
        url: `${base()}/comparisons/${comparisonId}/ai-explanation`,
      });
      expect(aiDisabled.json()).toEqual({ paragraphs: [], status: 'disabled' });
      await database.pool.query(
        `insert into organization_feature_flags
          (organization_id, key, enabled, updated_by_user_id)
         values ($1, 'comparison_ai_explanation', true, $2)`,
        [organizationA, ownerA],
      );
      const aiUnavailable = await app.inject({
        headers: { cookie: owner.cookie },
        method: 'GET',
        url: `${base()}/comparisons/${comparisonId}/ai-explanation`,
      });
      expect(aiUnavailable.json()).toEqual({
        paragraphs: [],
        status: 'unavailable',
      });

      const redactedReport = await app.inject({
        headers: { cookie: owner.cookie },
        method: 'GET',
        url: `${base()}/comparisons/${comparisonId}/report?includeValues=false`,
      });
      expect(redactedReport.statusCode, redactedReport.payload).toBe(200);
      expect(redactedReport.headers['content-type']).toContain('text/html');
      expect(redactedReport.payload).toContain(comparisonId);
      expect(redactedReport.payload).not.toContain(
        'Private quarterly operating review',
      );
      const includedReport = await app.inject({
        headers: { cookie: owner.cookie },
        method: 'GET',
        url: `${base()}/comparisons/${comparisonId}/report?includeValues=true`,
      });
      expect(includedReport.payload).toContain(
        'Private quarterly operating review',
      );

      const rows = await database.pool.query<{
        audits: number;
        comparisons: number;
        summaries: number;
      }>(
        `select
          (select count(*)::int from version_comparisons) as comparisons,
          (select count(*)::int from comparison_summaries) as summaries,
          (select count(*)::int from audit_events
            where action = 'comparison.report_generated') as audits`,
      );
      expect(rows.rows[0]).toEqual({
        audits: 2,
        comparisons: 1,
        summaries: 1,
      });
    });

    it('gates, caches, authorizes, and reference-protects private renditions', async () => {
      const owner = await login('alpha-owner');
      const viewer = await login('alpha-viewer');
      const sourceBytes = officeBytes('shared-rendition-source');
      const first = await push(owner, sourceBytes, null, 'First source');
      const firstVersionId = first.response.json().version.id as string;

      const premature = await app.inject({
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/versions/${firstVersionId}/renditions`,
      });
      expect(premature.statusCode).toBe(409);
      expect(premature.json().code).toBe('rendition_unavailable');

      await markVersionsProcessed([firstVersionId]);
      const key = randomUUID();
      const requested = await app.inject({
        headers: headers(owner, key),
        method: 'POST',
        url: `${base()}/versions/${firstVersionId}/renditions`,
      });
      expect(requested.statusCode, requested.payload).toBe(201);
      expect(requested.json()).toMatchObject({
        rendererProfile: 'office-pdf-v1',
        state: 'queued',
        versionId: firstVersionId,
      });
      const replay = await app.inject({
        headers: headers(owner, key),
        method: 'POST',
        url: `${base()}/versions/${firstVersionId}/renditions`,
      });
      expect(replay.statusCode, replay.payload).toBe(200);
      expect(replay.json().id).toBe(requested.json().id);

      const pdf = new TextEncoder().encode(
        '%PDF-1.7\n1 0 obj <</Type /Catalog>> endobj\n%%EOF',
      );
      const outputSha256 = sha256(pdf);
      const objectKey = `organizations/${organizationA}/renditions/cache/office-pdf-v1/${sha256(sourceBytes)}-libreoffice-local-mergecom-liberation-noto-v1.pdf`;
      await s3Client.send(
        new PutObjectCommand({
          Body: pdf,
          Bucket: bucket,
          ContentType: 'application/pdf',
          Key: objectKey,
        }),
      );
      await database.pool.query(
        `update version_renditions
            set status = 'completed', object_key = $2,
                rendition_sha256 = $3, byte_count = $4, page_count = 1,
                dimensions = '[{"width":612,"height":792}]'::jsonb,
                completed_at = now(), updated_at = now()
          where id = $1`,
        [requested.json().id, objectKey, outputSha256, pdf.byteLength],
      );
      await database.pool.query(
        `update version_rendition_jobs
            set status = 'completed', completed_at = now(), updated_at = now()
          where rendition_id = $1`,
        [requested.json().id],
      );

      const second = await push(
        owner,
        sourceBytes,
        firstVersionId,
        'Same immutable source',
      );
      const secondVersionId = second.response.json().version.id as string;
      await markVersionsProcessed([secondVersionId]);
      const cached = await app.inject({
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/versions/${secondVersionId}/renditions`,
      });
      expect(cached.statusCode, cached.payload).toBe(201);
      expect(cached.json()).toMatchObject({
        renditionSha256: outputSha256,
        state: 'completed',
        versionId: secondVersionId,
      });
      const persisted = await database.pool.query<{
        object_key: string;
        status: string;
      }>(
        `select object_key, status from version_renditions
          where source_sha256 = $1 order by created_at`,
        [sha256(sourceBytes)],
      );
      expect(persisted.rows).toEqual([
        { object_key: objectKey, status: 'completed' },
        { object_key: objectKey, status: 'completed' },
      ]);
      const events = await database.pool.query<{ count: number }>(
        `select count(*)::int as count from outbox_events
          where event_type = 'version.rendition_requested'`,
      );
      expect(events.rows[0]?.count).toBe(1);

      const grant = await app.inject({
        headers: headers(owner),
        method: 'POST',
        url: `${base()}/versions/${secondVersionId}/renditions/${cached.json().id as string}/grant`,
      });
      expect(grant.statusCode, grant.payload).toBe(200);
      expect(grant.json()).toMatchObject({
        byteCount: pdf.byteLength,
        pageCount: 1,
        sha256: outputSha256,
      });
      const preview = await fetch(grant.json().url as string);
      expect(preview.status).toBe(200);
      expect(preview.headers.get('content-type')).toContain('application/pdf');
      expect(new Uint8Array(await preview.arrayBuffer())).toEqual(pdf);

      const denied = await app.inject({
        headers: { cookie: viewer.cookie },
        method: 'GET',
        url: `${base()}/versions/${secondVersionId}/rendition`,
      });
      expect(denied.statusCode).toBe(404);

      await database.pool.query(
        'delete from version_renditions where id = $1',
        [requested.json().id],
      );
      const blobs = new S3BlobStore(storageConfig);
      const service = new VersionService(
        new PostgresVersionStore(
          database.pool,
          storageConfig.organizationQuotaBytes,
        ),
        blobs,
        storageConfig,
      );
      await service.cleanup(new Date(Date.now() + 60_000));
      expect(await blobs.headObject(objectKey)).not.toBeNull();
    });

    it('queues one graph-valid three-way merge and protects its retained candidate', async () => {
      const owner = await login('alpha-owner');
      const viewer = await login('alpha-viewer');
      const basis = await push(
        owner,
        officeBytes('merge-base'),
        null,
        'Merge base',
      );
      const baseVersionId = basis.response.json().version.id as string;
      const ours = await push(
        owner,
        officeBytes('merge-ours'),
        baseVersionId,
        'Current team edit',
      );
      const oursVersionId = ours.response.json().version.id as string;
      const theirs = await push(
        owner,
        officeBytes('merge-theirs'),
        baseVersionId,
        'Stale contributor edit',
      );
      expect(theirs.response.statusCode).toBe(409);
      const theirsVersionId = theirs.response.json().version.id as string;
      await markVersionsProcessed([baseVersionId, oursVersionId]);
      await database.pool.query(
        `update version_processing_jobs set status = 'completed', completed_at = now()
          where version_id = $1`,
        [theirsVersionId],
      );
      await database.pool.query(
        `update artifacts set scan_status = 'clean'
          where id = (select artifact_id from document_versions where id = $1)`,
        [theirsVersionId],
      );

      const idempotencyKey = randomUUID();
      const body = {
        baseVersionId,
        note: 'Merge stale contributor work',
        oursVersionId,
        theirsVersionId,
      };
      const created = await app.inject({
        body,
        headers: headers(owner, idempotencyKey),
        method: 'POST',
        url: `${base()}/merges`,
      });
      expect(created.statusCode, created.payload).toBe(201);
      expect(created.json()).toMatchObject({
        analysis: null,
        baseVersion: { id: baseVersionId },
        candidate: null,
        engineVersion: '1.2.0',
        mergeSchemaVersion: '1.2.0',
        oursVersion: { id: oursVersionId },
        state: 'queued',
        theirsVersion: { id: theirsVersionId, status: 'conflicted' },
      });

      const replay = await app.inject({
        body,
        headers: headers(owner, idempotencyKey),
        method: 'POST',
        url: `${base()}/merges`,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().id).toBe(created.json().id);
      const read = await app.inject({
        headers: { cookie: owner.cookie },
        method: 'GET',
        url: `${base()}/merges/${created.json().id as string}`,
      });
      expect(read.statusCode, read.payload).toBe(200);
      const denied = await app.inject({
        headers: { cookie: viewer.cookie },
        method: 'GET',
        url: `${base()}/merges/${created.json().id as string}`,
      });
      expect(denied.statusCode).toBe(404);
      const candidate = await app.inject({
        headers: headers(owner),
        method: 'POST',
        url: `${base()}/merges/${created.json().id as string}/candidate/download`,
      });
      expect(candidate.statusCode).toBe(404);

      const unavailable = await app.inject({
        body: { ...body, oursVersionId: baseVersionId },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/merges`,
      });
      expect(unavailable.statusCode).toBe(409);
      expect(unavailable.json().code).toBe('merge_unavailable');
      const evidence = await database.pool.query<{
        audits: number;
        merges: number;
        outbox: number;
      }>(
        `select
          (select count(*)::int from merge_operations) as merges,
          (select count(*)::int from audit_events
            where action = 'merge.requested') as audits,
          (select count(*)::int from outbox_events
            where event_type = 'version.merge_requested') as outbox`,
      );
      expect(evidence.rows[0]).toEqual({ audits: 1, merges: 1, outbox: 1 });
    });

    it('persists review decisions, anchored discussion, and a monotonic approved pointer', async () => {
      const owner = await login('alpha-owner');
      const reviewer = await login('alpha-reviewer');
      const contributor = await login('alpha-contributor');
      const viewer = await login('alpha-viewer');
      const first = await push(
        owner,
        officeBytes('review-base'),
        null,
        'Review base',
      );
      const baseVersionId = first.response.json().version.id as string;
      const second = await push(
        owner,
        officeBytes('review-target'),
        baseVersionId,
        'Review target',
      );
      const targetVersionId = second.response.json().version.id as string;
      await markVersionsProcessed([baseVersionId, targetVersionId]);

      const comparisonResponse = await app.inject({
        body: { baseVersionId, targetVersionId },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/comparisons`,
      });
      expect(comparisonResponse.statusCode, comparisonResponse.payload).toBe(
        201,
      );
      const comparisonId = comparisonResponse.json().id as string;
      const changeId = 'a'.repeat(64);
      await database.pool.query(
        `update version_comparisons
            set status = 'completed', completed_at = now(),
                result_object_key = $2, result_sha256 = $3, stable_hash = $4,
                byte_equal = false, semantic_equal = false,
                completeness = 'complete', summary = $5, changes = $6,
                updated_at = now()
          where id = $1`,
        [
          comparisonId,
          `organizations/${organizationA}/comparisons/${comparisonId}/result.json`,
          'b'.repeat(64),
          'c'.repeat(64),
          JSON.stringify({ content: 1, modified: 1, total: 1 }),
          JSON.stringify([
            {
              after: 'Annual operating review',
              before: 'Quarterly operating review',
              category: 'content',
              changeType: 'modified',
              entityType: 'paragraph',
              id: changeId,
              impact: 'medium',
              label: 'Paragraph',
              path: '/body/p/1',
            },
          ]),
        ],
      );

      const createKey = randomUUID();
      const reviewBody = {
        comparisonId,
        message: 'Please verify the operating review update.',
        reviewerUserIds: [reviewerA],
        versionId: targetVersionId,
      };
      const created = await app.inject({
        body: reviewBody,
        headers: headers(owner, createKey),
        method: 'POST',
        url: `${base()}/reviews`,
      });
      expect(created.statusCode, created.payload).toBe(201);
      expect(created.json()).toMatchObject({
        assignments: [
          {
            decision: null,
            reviewer: { id: reviewerA, name: 'Alpha Reviewer' },
          },
        ],
        comparisonId,
        status: 'open',
        version: { id: targetVersionId },
      });
      const reviewRequestId = created.json().id as string;
      const replay = await app.inject({
        body: reviewBody,
        headers: headers(owner, createKey),
        method: 'POST',
        url: `${base()}/reviews`,
      });
      expect(replay.statusCode, replay.payload).toBe(200);
      expect(replay.json().id).toBe(reviewRequestId);

      const deniedDecision = await app.inject({
        body: { decision: 'approved', note: 'Not assigned.' },
        headers: headers(contributor, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${reviewRequestId}/decisions`,
      });
      expect(deniedDecision.statusCode).toBe(403);
      const hidden = await app.inject({
        headers: { cookie: viewer.cookie },
        method: 'GET',
        url: `${base()}/reviews/${reviewRequestId}`,
      });
      expect(hidden.statusCode).toBe(404);

      const thread = await app.inject({
        body: {
          anchor: {
            category: 'content',
            changeId,
            comparisonId,
            label: 'Paragraph',
            path: '/body/p/1',
          },
          body: 'Please confirm this wording with the client.',
        },
        headers: headers(reviewer, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${reviewRequestId}/threads`,
      });
      expect(thread.statusCode, thread.payload).toBe(201);
      expect(thread.json().threads[0]).toMatchObject({
        anchor: { changeId, path: '/body/p/1' },
        comments: [{ body: 'Please confirm this wording with the client.' }],
        status: 'open',
      });
      const threadId = thread.json().threads[0].id as string;
      const reply = await app.inject({
        body: { body: 'Confirmed against the signed brief.' },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${reviewRequestId}/threads/${threadId}/comments`,
      });
      expect(reply.statusCode, reply.payload).toBe(201);
      expect(reply.json().threads[0].comments).toHaveLength(2);
      const resolved = await app.inject({
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${reviewRequestId}/threads/${threadId}/resolve`,
      });
      expect(resolved.statusCode, resolved.payload).toBe(200);
      expect(resolved.json().threads[0].status).toBe('resolved');
      const openThread = await app.inject({
        body: {
          anchor: null,
          body: 'Retain this open question with the completed review.',
        },
        headers: headers(reviewer, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${reviewRequestId}/threads`,
      });
      expect(openThread.statusCode, openThread.payload).toBe(201);
      const openThreadId = openThread.json().threads[1].id as string;

      const approved = await app.inject({
        body: {
          decision: 'approved',
          note: 'Wording and source were verified.',
        },
        headers: headers(reviewer, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${reviewRequestId}/decisions`,
      });
      expect(approved.statusCode, approved.payload).toBe(200);
      expect(approved.json()).toMatchObject({
        approvedVersion: { id: targetVersionId },
        assignments: [{ decision: { decision: 'approved' } }],
        status: 'approved',
      });
      expect(approved.json().threads[1]).toMatchObject({
        canResolve: false,
        status: 'open',
      });
      const resolveClosed = await app.inject({
        headers: headers(reviewer, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${reviewRequestId}/threads/${openThreadId}/resolve`,
      });
      expect(resolveClosed.statusCode).toBe(409);
      expect(resolveClosed.json().code).toBe('review_closed');
      const branch = await database.pool.query<{ approved_version_id: string }>(
        `select approved_version_id from document_branches
          where document_id = $1 and is_default = true`,
        [documentA],
      );
      expect(branch.rows[0]?.approved_version_id).toBe(targetVersionId);
      await expect(
        database.pool.query(
          `update review_decisions set note = 'changed' where review_request_id = $1`,
          [reviewRequestId],
        ),
      ).rejects.toMatchObject({ code: '55000' });

      const third = await push(
        owner,
        officeBytes('review-third'),
        targetVersionId,
        'Third version',
      );
      const thirdVersionId = third.response.json().version.id as string;
      await markVersionsProcessed([thirdVersionId]);
      const followUp = await app.inject({
        body: {
          comparisonId: null,
          message: 'Review the follow-up.',
          reviewerUserIds: [reviewerA],
          versionId: thirdVersionId,
        },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews`,
      });
      expect(followUp.statusCode, followUp.payload).toBe(201);
      const changesRequested = await app.inject({
        body: {
          decision: 'changes_requested',
          note: 'The total needs supporting detail.',
        },
        headers: headers(reviewer, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${followUp.json().id as string}/decisions`,
      });
      expect(changesRequested.statusCode, changesRequested.payload).toBe(200);
      expect(changesRequested.json()).toMatchObject({
        approvedVersion: { id: targetVersionId },
        status: 'changes_requested',
      });

      const fourth = await push(
        owner,
        officeBytes('review-fourth'),
        thirdVersionId,
        'Fourth version',
      );
      const fourthVersionId = fourth.response.json().version.id as string;
      const fifth = await push(
        owner,
        officeBytes('review-fifth'),
        fourthVersionId,
        'Fifth version',
      );
      const fifthVersionId = fifth.response.json().version.id as string;
      await markVersionsProcessed([fourthVersionId, fifthVersionId]);
      const fourthReview = await app.inject({
        body: {
          comparisonId: null,
          message: 'Review the fourth version.',
          reviewerUserIds: [reviewerA],
          versionId: fourthVersionId,
        },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews`,
      });
      const fifthReview = await app.inject({
        body: {
          comparisonId: null,
          message: 'Review the fifth version.',
          reviewerUserIds: [reviewerA],
          versionId: fifthVersionId,
        },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews`,
      });
      expect(fourthReview.statusCode, fourthReview.payload).toBe(201);
      expect(fifthReview.statusCode, fifthReview.payload).toBe(201);
      const newestApproval = await app.inject({
        body: { decision: 'approved', note: 'Newest version is ready.' },
        headers: headers(reviewer, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${fifthReview.json().id as string}/decisions`,
      });
      expect(newestApproval.statusCode, newestApproval.payload).toBe(200);
      expect(newestApproval.json()).toMatchObject({
        approvedVersion: { id: fifthVersionId },
        status: 'approved',
      });
      const staleApproval = await app.inject({
        body: { decision: 'approved', note: 'Older version is also valid.' },
        headers: headers(reviewer, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${fourthReview.json().id as string}/decisions`,
      });
      expect(staleApproval.statusCode, staleApproval.payload).toBe(200);
      expect(staleApproval.json()).toMatchObject({
        approvedVersion: { id: fifthVersionId },
        status: 'superseded',
      });
      const finalBranch = await database.pool.query<{
        approved_version_id: string;
      }>(
        `select approved_version_id from document_branches
          where document_id = $1 and is_default = true`,
        [documentA],
      );
      expect(finalBranch.rows[0]?.approved_version_id).toBe(fifthVersionId);

      const sixth = await push(
        contributor,
        officeBytes('review-sixth'),
        fifthVersionId,
        'Sixth version',
      );
      const sixthVersionId = sixth.response.json().version.id as string;
      await markVersionsProcessed([sixthVersionId]);
      const unanimousReview = await app.inject({
        body: {
          comparisonId: null,
          message: 'Complete a two-person review.',
          reviewerUserIds: [ownerA, reviewerA],
          versionId: sixthVersionId,
        },
        headers: headers(contributor, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews`,
      });
      expect(unanimousReview.statusCode, unanimousReview.payload).toBe(201);
      const unanimousReviewId = unanimousReview.json().id as string;
      const firstApproval = await app.inject({
        body: { decision: 'approved', note: 'First approval.' },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${unanimousReviewId}/decisions`,
      });
      expect(firstApproval.statusCode, firstApproval.payload).toBe(200);
      expect(firstApproval.json()).toMatchObject({
        approvedVersion: { id: fifthVersionId },
        status: 'open',
      });
      const unanimousApproval = await app.inject({
        body: { decision: 'approved', note: 'Second approval.' },
        headers: headers(reviewer, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews/${unanimousReviewId}/decisions`,
      });
      expect(unanimousApproval.statusCode, unanimousApproval.payload).toBe(200);
      expect(unanimousApproval.json()).toMatchObject({
        approvedVersion: { id: sixthVersionId },
        status: 'approved',
      });

      const seventh = await push(
        owner,
        officeBytes('review-seventh'),
        sixthVersionId,
        'Seventh version',
      );
      const seventhVersionId = seventh.response.json().version.id as string;
      await markVersionsProcessed([seventhVersionId]);
      const cancellable = await app.inject({
        body: {
          comparisonId: null,
          message: 'Cancel this review.',
          reviewerUserIds: [reviewerA],
          versionId: seventhVersionId,
        },
        headers: headers(owner, randomUUID()),
        method: 'POST',
        url: `${base()}/reviews`,
      });
      expect(cancellable.statusCode, cancellable.payload).toBe(201);
      const cancelKey = randomUUID();
      const cancelled = await app.inject({
        headers: headers(owner, cancelKey),
        method: 'POST',
        url: `${base()}/reviews/${cancellable.json().id as string}/cancel`,
      });
      expect(cancelled.statusCode, cancelled.payload).toBe(200);
      expect(cancelled.json().status).toBe('cancelled');
      const cancelReplay = await app.inject({
        headers: headers(owner, cancelKey),
        method: 'POST',
        url: `${base()}/reviews/${cancellable.json().id as string}/cancel`,
      });
      expect(cancelReplay.statusCode, cancelReplay.payload).toBe(200);
      expect(cancelReplay.json().status).toBe('cancelled');
      const audits = await database.pool.query<{ count: number }>(
        `select count(*)::int as count from audit_events
          where target_type in ('review_request', 'review_thread', 'review_comment')
            and result = 'succeeded'`,
      );
      expect(audits.rows[0]?.count).toBeGreaterThanOrEqual(17);
    });

    it('uses branch locking so only one simultaneous push advances the head', async () => {
      const owner = await login('alpha-owner');
      const first = await push(owner, officeBytes('root'), null, 'Root');
      const rootId = first.response.json().version.id as string;
      const bytesA = officeBytes('simultaneous-a');
      const bytesB = officeBytes('simultaneous-b');
      const intentA = await createIntent(owner, bytesA, rootId);
      const intentB = await createIntent(owner, bytesB, rootId);
      await Promise.all([
        uploadSingle(intentA, bytesA),
        uploadSingle(intentB, bytesB),
      ]);
      const [resultA, resultB] = await Promise.all([
        finalize(owner, intentA.id, 'Concurrent A'),
        finalize(owner, intentB.id, 'Concurrent B'),
      ]);
      expect([resultA.statusCode, resultB.statusCode].sort()).toEqual([
        201, 409,
      ]);
      const statuses = [
        resultA.json().version.status,
        resultB.json().version.status,
      ].sort();
      expect(statuses).toEqual(['conflicted', 'pending_processing']);
      const head = await database.pool.query<{ head_version_id: string }>(
        `select head_version_id from document_branches where document_id = $1`,
        [documentA],
      );
      const created = [resultA, resultB].find(
        (result) => result.statusCode === 201,
      )!;
      expect(head.rows[0]?.head_version_id).toBe(created.json().version.id);
    });

    it('rejects invalid bytes and hash mismatches without retained metadata', async () => {
      const owner = await login('alpha-owner');
      const bytes = officeBytes('tampered');
      const intent = await createIntent(owner, bytes, null, {
        expectedSha256: '0'.repeat(64),
      });
      await uploadSingle(intent, bytes);
      const response = await finalize(owner, intent.id, 'Tampered upload');
      expect(response.statusCode, response.payload).toBe(400);
      expect(response.json().code).toBe('invalid_hash');
      const rows = await database.pool.query<{ status: string }>(
        `select status from staged_uploads where id = $1`,
        [intent.id],
      );
      expect(rows.rows[0]?.status).toBe('failed');

      const invalidBytes = new TextEncoder().encode('not an Office package');
      const invalidIntent = await createIntent(owner, invalidBytes, null);
      await uploadSingle(invalidIntent, invalidBytes);
      const invalidResponse = await finalize(
        owner,
        invalidIntent.id,
        'Invalid package',
      );
      expect(invalidResponse.statusCode, invalidResponse.payload).toBe(400);
      expect(invalidResponse.json().code).toBe('invalid_office_package');
      expect(
        (await database.pool.query('select 1 from artifacts')).rowCount,
      ).toBe(0);
    });

    it('gates download authorization and signed URL expiry', async () => {
      const owner = await login('alpha-owner');
      const viewer = await login('alpha-viewer');
      const bytes = officeBytes('authorized');
      const pushed = await push(owner, bytes, null, 'Authorized version');
      const versionId = pushed.response.json().version.id as string;
      const denied = await app.inject({
        headers: headers(viewer),
        method: 'POST',
        url: `${base()}/versions/${versionId}/download`,
      });
      expect(denied.statusCode).toBe(404);

      const expiringDownload = await app.inject({
        headers: headers(owner),
        method: 'POST',
        url: `${base()}/versions/${versionId}/download`,
      });
      expect(expiringDownload.statusCode, expiringDownload.payload).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      const expiredGet = await fetch(
        expiringDownload.json<{ url: string }>().url,
      );
      expect(expiredGet.ok).toBe(false);
    }, 15_000);

    it('aborts an interrupted multipart upload and prevents finalization', async () => {
      const owner = await login('alpha-owner');
      const bytes = officeBytes('multipart', 5 * 1024 * 1024 + 256);
      const intent = await createIntent(owner, bytes, null);
      expect(intent.mode).toBe('multipart');
      expect(intent.multipart?.partCount).toBe(2);
      const grant = await app.inject({
        headers: headers(owner),
        method: 'POST',
        url: `${base()}/uploads/${intent.id}/parts/1/grant`,
      });
      expect(grant.statusCode, grant.payload).toBe(200);
      const firstPart = bytes.slice(0, intent.multipart!.partSize);
      expect(
        (await put(grant.json<{ url: string }>().url, firstPart)).status,
      ).toBe(200);
      const cancelled = await app.inject({
        headers: headers(owner),
        method: 'DELETE',
        url: `${base()}/uploads/${intent.id}`,
      });
      expect(cancelled.statusCode, cancelled.payload).toBe(204);
      const finalization = await finalize(
        owner,
        intent.id,
        'Interrupted upload',
      );
      expect(finalization.statusCode).toBe(409);
      const key = await database.pool.query<{ staging_object_key: string }>(
        `select staging_object_key from staged_uploads where id = $1`,
        [intent.id],
      );
      const blobs = new S3BlobStore(storageConfig);
      expect(
        await blobs.headObject(key.rows[0]!.staging_object_key),
      ).toBeNull();
      expect(
        await blobs.listMultipartUploads(key.rows[0]!.staging_object_key),
      ).toHaveLength(0);
    });

    it('expires abandoned uploads and removes only unreferenced staging bytes', async () => {
      const owner = await login('alpha-owner');
      const retainedBytes = officeBytes('retained');
      const retained = await push(
        owner,
        retainedBytes,
        null,
        'Retained version',
      );
      const retainedVersionId = retained.response.json().version.id as string;
      const artifact = await database.pool.query<{ object_key: string }>(
        `select a.object_key from artifacts a
          join document_versions v on v.artifact_id = a.id
         where v.id = $1`,
        [retainedVersionId],
      );
      const bytes = officeBytes('abandoned');
      const intent = await createIntent(owner, bytes, retainedVersionId);
      await uploadSingle(intent, bytes);
      const row = await database.pool.query<{ staging_object_key: string }>(
        `update staged_uploads set expires_at = now() - interval '1 minute'
          where id = $1 returning staging_object_key`,
        [intent.id],
      );
      const blobs = new S3BlobStore(storageConfig);
      const service = new VersionService(
        new PostgresVersionStore(
          database.pool,
          storageConfig.organizationQuotaBytes,
        ),
        blobs,
        storageConfig,
      );
      const orphanedMultipartKey = `organizations/${organizationA}/staging/${randomUUID()}`;
      await blobs.createMultipartUpload(
        orphanedMultipartKey,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
      const result = await service.cleanup(
        new Date(Date.now() + 2 * 60 * 60 * 1000),
      );
      expect(result.expiredUploads).toBe(1);
      expect(result.orphanedObjects).toBe(1);
      expect(
        await blobs.headObject(row.rows[0]!.staging_object_key),
      ).toBeNull();
      const status = await database.pool.query<{ status: string }>(
        'select status from staged_uploads where id = $1',
        [intent.id],
      );
      expect(status.rows[0]?.status).toBe('expired');
      expect(
        await blobs.headObject(artifact.rows[0]!.object_key),
      ).not.toBeNull();
      expect(
        await blobs.listMultipartUploads(orphanedMultipartKey),
      ).toHaveLength(0);
    });
  },
);
