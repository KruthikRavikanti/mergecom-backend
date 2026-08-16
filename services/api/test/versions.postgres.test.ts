import { createHash, randomUUID } from 'node:crypto';

import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
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
    nodeEnv: 'test',
    oidc: null,
    sessionAbsoluteMilliseconds: 24 * 60 * 60 * 1000,
    sessionIdleMilliseconds: 60 * 60 * 1000,
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
        ('32000000-0000-4000-8000-000000000004', $5, $6, 'owner', 'active')`,
        [organizationA, ownerA, contributorA, viewerA, organizationB, ownerB],
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
               'contributor', $3)`,
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
