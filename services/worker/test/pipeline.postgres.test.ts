import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ArtifactStorage } from '../src/artifact-storage';
import type { WorkerConfig } from '../src/config';
import { DocumentEngineClient } from '../src/document-engine-client';
import {
  ComparisonProcessor,
  DocumentProcessor,
  MergeProcessor,
} from '../src/pipeline';
import { ProcessingStore } from '../src/processing-store';

const databaseUrl = process.env.TEST_WORKER_DATABASE_URL;
const s3Endpoint = process.env.TEST_S3_ENDPOINT;
const engineUrl = process.env.TEST_DOCUMENT_ENGINE_URL;
const runInfrastructureTests = Boolean(databaseUrl && s3Endpoint && engineUrl);
const bucket = process.env.TEST_S3_BUCKET ?? 'mergecom-artifacts';

describe.runIf(runInfrastructureTests)('durable OOXML pipeline', () => {
  let pool: Pool;
  let store: ProcessingStore;
  let s3: S3Client;
  const keys: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    store = new ProcessingStore(databaseUrl!);
    s3 = new S3Client({
      credentials: {
        accessKeyId: process.env.TEST_S3_ACCESS_KEY ?? 'mergecom-local',
        secretAccessKey:
          process.env.TEST_S3_SECRET_KEY ?? 'mergecom-local-only',
      },
      endpoint: s3Endpoint!,
      forcePathStyle: true,
      region: 'us-east-1',
    });
  });

  afterAll(async () => {
    await Promise.all(
      keys.map(async (key) =>
        s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
      ),
    );
    await store.close();
    await pool.end();
  });

  it('persists deterministic snapshots and comparisons across duplicate delivery', async () => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const projectId = randomUUID();
    const documentId = randomUUID();
    const branchId = randomUUID();
    const artifactId = randomUUID();
    const versionId = randomUUID();
    const jobId = randomUUID();
    const fixture = await readFile(
      path.resolve('../../packages/test-fixtures/office/valid-word.docx'),
    );
    const sha256 = createHash('sha256').update(fixture).digest('hex');
    const objectKey = `organizations/${organizationId}/artifacts/${artifactId}/source.docx`;
    keys.push(objectKey);
    await s3.send(
      new PutObjectCommand({
        Body: fixture,
        Bucket: bucket,
        ContentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        Key: objectKey,
      }),
    );
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into organizations (id, name, slug)
         values ($1, 'Worker Integration', $2)`,
        [organizationId, `worker-${organizationId}`],
      );
      await client.query(
        `insert into users
          (id, display_name, primary_email, email_verified)
         values ($1, 'Worker Test', $2, true)`,
        [userId, `worker-${userId}@mergecom.test`],
      );
      await client.query(
        `insert into projects (id, organization_id, name, created_by_user_id)
         values ($1, $2, 'Pipeline', $3)`,
        [projectId, organizationId, userId],
      );
      await client.query(
        `insert into documents
          (id, organization_id, project_id, name, kind, created_by_user_id)
         values ($1, $2, $3, 'Fixture.docx', 'word_document', $4)`,
        [documentId, organizationId, projectId, userId],
      );
      await client.query(
        `insert into document_branches
          (id, organization_id, document_id, name, is_default,
           created_by_user_id)
         values ($1, $2, $3, 'main', true, $4)`,
        [branchId, organizationId, documentId, userId],
      );
      await client.query(
        `insert into artifacts
          (id, organization_id, object_key, sha256, byte_size,
           detected_media_type, original_filename, extension,
           created_by_user_id)
         values ($1, $2, $3, $4, $5,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Fixture.docx', '.docx', $6)`,
        [
          artifactId,
          organizationId,
          objectKey,
          sha256,
          fixture.byteLength,
          userId,
        ],
      );
      await client.query(
        `insert into document_versions
          (id, organization_id, document_id, branch_id, artifact_id, sequence,
           display_number, source, status, note, author_user_id)
         values ($1, $2, $3, $4, $5, 1, 1, 'web_upload',
          'pending_processing', 'Integration', $6)`,
        [versionId, organizationId, documentId, branchId, artifactId, userId],
      );
      await client.query(
        `update document_branches set head_version_id = $1 where id = $2`,
        [versionId, branchId],
      );
      await client.query(
        `insert into version_processing_jobs
          (id, organization_id, version_id, job_type)
         values ($1, $2, $3, 'semantic_ingestion')`,
        [jobId, organizationId, versionId],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const config = workerConfig(databaseUrl!, s3Endpoint!);
    const processor = new DocumentProcessor(
      store,
      new ArtifactStorage(config),
      new DocumentEngineClient(engineUrl!, config.documentEngineToken),
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
    );
    await processor.process(jobId);
    const first = await pool.query<{
      snapshot_sha256: string;
      stable_hash: string;
      status: string;
    }>(
      `select j.status, s.snapshot_sha256, s.stable_hash
         from version_processing_jobs j
         join normalized_snapshots s on s.version_id = j.version_id
        where j.id = $1`,
      [jobId],
    );
    expect(first.rows[0]).toMatchObject({ status: 'completed' });
    expect(first.rows[0]?.stable_hash).toMatch(/^[0-9a-f]{64}$/u);

    await new DocumentProcessor(
      store,
      new ArtifactStorage(config),
      new DocumentEngineClient(engineUrl!, config.documentEngineToken),
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
    ).process(jobId);
    const duplicate = await pool.query<{ count: number }>(
      `select count(*)::int as count from normalized_snapshots where version_id = $1`,
      [versionId],
    );
    expect(duplicate.rows[0]?.count).toBe(1);
    const snapshotKey = `organizations/${organizationId}/snapshots/${versionId}/schema-1.1.0-parser-1.1.0.json`;
    keys.push(snapshotKey);

    const targetVersionId = randomUUID();
    const targetJobId = randomUUID();
    const comparisonId = randomUUID();
    await pool.query(
      `insert into document_versions
        (id, organization_id, document_id, branch_id, artifact_id, sequence,
         display_number, parent_version_id, source, status, note,
         author_user_id)
       values ($1, $2, $3, $4, $5, 2, 2, $6, 'restore', 'ready',
               'Exact-byte restore', $7)`,
      [
        targetVersionId,
        organizationId,
        documentId,
        branchId,
        artifactId,
        versionId,
        userId,
      ],
    );
    await pool.query(
      `insert into version_processing_jobs
        (id, organization_id, version_id, job_type, status, attempts,
         started_at, completed_at)
       values ($1, $2, $3, 'semantic_ingestion', 'completed', 1, now(), now())`,
      [targetJobId, organizationId, targetVersionId],
    );
    await pool.query(
      `insert into version_comparisons
        (id, organization_id, document_id, base_version_id,
         target_version_id, requested_by_user_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        comparisonId,
        organizationId,
        documentId,
        versionId,
        targetVersionId,
        userId,
      ],
    );
    const comparisonProcessor = new ComparisonProcessor(
      store,
      new ArtifactStorage(config),
      new DocumentEngineClient(engineUrl!, config.documentEngineToken),
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
    );
    await comparisonProcessor.process(comparisonId);
    const comparison = await pool.query<{
      byte_equal: boolean;
      result_object_key: string;
      stable_hash: string;
      status: string;
    }>(
      `select status, byte_equal, stable_hash, result_object_key
         from version_comparisons where id = $1`,
      [comparisonId],
    );
    expect(comparison.rows[0]).toMatchObject({
      byte_equal: true,
      status: 'completed',
    });
    expect(comparison.rows[0]?.stable_hash).toMatch(/^[0-9a-f]{64}$/u);
    keys.push(comparison.rows[0]!.result_object_key);

    await comparisonProcessor.process(comparisonId);
    const comparisonEvents = await pool.query<{ count: number }>(
      `select count(*)::int as count from outbox_events
        where aggregate_id = $1 and event_type = 'version.comparison_finished'`,
      [comparisonId],
    );
    expect(comparisonEvents.rows[0]?.count).toBe(1);

    const theirsVersionId = randomUUID();
    const theirsJobId = randomUUID();
    const mergeId = randomUUID();
    await pool.query(
      `insert into document_versions
        (id, organization_id, document_id, branch_id, artifact_id, sequence,
         display_number, parent_version_id, base_version_id, source, status,
         note, conflict_reason, author_user_id)
       values ($1, $2, $3, $4, $5, 3, 3, $6, $6, 'web_upload',
               'conflicted', 'Retained stale edit',
               'base_version_is_not_current_head', $7)`,
      [
        theirsVersionId,
        organizationId,
        documentId,
        branchId,
        artifactId,
        versionId,
        userId,
      ],
    );
    await pool.query(
      `insert into version_processing_jobs
        (id, organization_id, version_id, job_type, status, attempts,
         started_at, completed_at)
       values ($1, $2, $3, 'semantic_ingestion', 'completed', 1, now(), now())`,
      [theirsJobId, organizationId, theirsVersionId],
    );
    await pool.query(
      `update document_branches set head_version_id = $1 where id = $2`,
      [targetVersionId, branchId],
    );
    await pool.query(
      `insert into merge_operations
        (id, organization_id, document_id, branch_id, base_version_id,
         ours_version_id, theirs_version_id, requested_by_user_id, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8,
               'Merge retained exact-byte edit')`,
      [
        mergeId,
        organizationId,
        documentId,
        branchId,
        versionId,
        targetVersionId,
        theirsVersionId,
        userId,
      ],
    );
    const mergeProcessor = new MergeProcessor(
      store,
      new ArtifactStorage(config),
      new DocumentEngineClient(engineUrl!, config.documentEngineToken),
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
    );
    await mergeProcessor.process(mergeId);
    const merge = await pool.query<{
      analysis: {
        automaticMergeEnabled: boolean;
        schemaVersion: string;
      };
      candidate_object_key: string;
      result_version_id: string;
      stable_hash: string;
      status: string;
      strategy: string;
    }>(
      `select status, strategy, stable_hash, candidate_object_key, analysis,
              result_version_id
         from merge_operations where id = $1`,
      [mergeId],
    );
    expect(merge.rows[0]).toMatchObject({
      analysis: {
        automaticMergeEnabled: false,
        schemaVersion: '1.0.0',
      },
      status: 'completed',
      strategy: 'identical_heads',
    });
    expect(merge.rows[0]?.stable_hash).toMatch(/^[0-9a-f]{64}$/u);
    keys.push(merge.rows[0]!.candidate_object_key);
    const mergedVersion = await pool.query<{
      merge_parent_version_id: string;
      parent_version_id: string;
      source: string;
      status: string;
    }>(
      `select source, status, parent_version_id, merge_parent_version_id
         from document_versions where id = $1`,
      [merge.rows[0]!.result_version_id],
    );
    expect(mergedVersion.rows[0]).toEqual({
      merge_parent_version_id: theirsVersionId,
      parent_version_id: targetVersionId,
      source: 'merge',
      status: 'pending_processing',
    });
    const resultJob = await pool.query<{ id: string }>(
      `select id from version_processing_jobs where version_id = $1`,
      [merge.rows[0]!.result_version_id],
    );
    await processor.process(resultJob.rows[0]!.id);
    const ready = await pool.query<{ status: string }>(
      `select status from document_versions where id = $1`,
      [merge.rows[0]!.result_version_id],
    );
    expect(ready.rows[0]?.status).toBe('ready');
    keys.push(
      `organizations/${organizationId}/snapshots/${merge.rows[0]!.result_version_id}/schema-1.1.0-parser-1.1.0.json`,
    );

    await mergeProcessor.process(mergeId);
    const mergeEvidence = await pool.query<{
      events: number;
      versions: number;
    }>(
      `select
        (select count(*)::int from outbox_events
          where aggregate_id = $1 and event_type = 'version.merge_finished') as events,
        (select count(*)::int from document_versions
          where source = 'merge' and base_version_id = $2) as versions`,
      [mergeId, versionId],
    );
    expect(mergeEvidence.rows[0]).toEqual({ events: 1, versions: 1 });

    const quotaMergeId = randomUUID();
    await pool.query(
      `insert into merge_operations
        (id, organization_id, document_id, branch_id, base_version_id,
         ours_version_id, theirs_version_id, requested_by_user_id, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8,
               'Retain over-quota candidate')`,
      [
        quotaMergeId,
        organizationId,
        documentId,
        branchId,
        versionId,
        merge.rows[0]!.result_version_id,
        theirsVersionId,
        userId,
      ],
    );
    const quotaStore = new ProcessingStore(databaseUrl!, 1);
    try {
      await new MergeProcessor(
        quotaStore,
        new ArtifactStorage(config),
        new DocumentEngineClient(engineUrl!, config.documentEngineToken),
        config.leaseMilliseconds,
        config.heartbeatMilliseconds,
      ).process(quotaMergeId);
    } finally {
      await quotaStore.close();
    }
    const quotaMerge = await pool.query<{
      candidate_object_key: string;
      failure_code: string;
      result_version_id: string | null;
      status: string;
    }>(
      `select status, failure_code, candidate_object_key, result_version_id
         from merge_operations where id = $1`,
      [quotaMergeId],
    );
    expect(quotaMerge.rows[0]).toMatchObject({
      failure_code: 'merge_quota_exceeded',
      result_version_id: null,
      status: 'manual_resolution_required',
    });
    keys.push(quotaMerge.rows[0]!.candidate_object_key);
    const quotaEvidence = await pool.query<{
      head_version_id: string;
      versions: number;
    }>(
      `select b.head_version_id,
              (select count(*)::int from document_versions
                where source = 'merge' and base_version_id = $2) as versions
         from document_branches b where b.id = $1`,
      [branchId, versionId],
    );
    expect(quotaEvidence.rows[0]).toEqual({
      head_version_id: merge.rows[0]!.result_version_id,
      versions: 1,
    });
  });
});

function workerConfig(
  testDatabaseUrl: string,
  testS3Endpoint: string,
): WorkerConfig {
  return {
    concurrency: 1,
    databaseUrl: testDatabaseUrl,
    dispatchIntervalMilliseconds: 2_000,
    documentEngineToken: 'mergecom-local-document-engine-token',
    documentEngineUrl: engineUrl!,
    heartbeatMilliseconds: 5_000,
    host: '127.0.0.1',
    leaseMilliseconds: 30_000,
    maxArtifactBytes: 100 * 1024 * 1024,
    notificationConcurrency: 1,
    notificationFrom: 'MergeCom <no-reply@mergecom.local>',
    organizationQuotaBytes: 5 * 1024 * 1024 * 1024,
    port: 3002,
    powerPointAutomaticMergeEnabled: false,
    powerPointAutomaticMergePilotOrganizationIds: [],
    redisUrl: 'redis://127.0.0.1:6379',
    smtpUrl: 'smtp://127.0.0.1:1025',
    s3: {
      accessKey: process.env.TEST_S3_ACCESS_KEY ?? 'mergecom-local',
      bucket,
      endpoint: testS3Endpoint,
      forcePathStyle: true,
      region: 'us-east-1',
      secretKey: process.env.TEST_S3_SECRET_KEY ?? 'mergecom-local-only',
    },
    webOrigin: 'http://127.0.0.1:5173',
  };
}
