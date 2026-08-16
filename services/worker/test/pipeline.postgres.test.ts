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
import { DocumentProcessor } from '../src/pipeline';
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

  it('recovers durable intent, persists one snapshot, and ignores duplicate delivery', async () => {
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
    const snapshotKey = `organizations/${organizationId}/snapshots/${versionId}/schema-1.0.0-parser-1.0.0.json`;
    keys.push(snapshotKey);
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
    port: 3002,
    redisUrl: 'redis://127.0.0.1:6379',
    s3: {
      accessKey: process.env.TEST_S3_ACCESS_KEY ?? 'mergecom-local',
      bucket,
      endpoint: testS3Endpoint,
      forcePathStyle: true,
      region: 'us-east-1',
      secretKey: process.env.TEST_S3_SECRET_KEY ?? 'mergecom-local-only',
    },
  };
}
