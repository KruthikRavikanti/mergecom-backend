import { Pool, type PoolClient } from 'pg';

import type {
  ClaimedProcessingJob,
  DispatchableJob,
  InspectionResult,
} from './types';

interface ClaimRow {
  artifact_byte_size: string | number;
  artifact_object_key: string;
  artifact_sha256: string;
  attempts: number;
  extension: string;
  file_type: ClaimedProcessingJob['fileType'];
  id: string;
  max_attempts: number;
  organization_id: string;
  trace_id: string;
  version_id: string;
}

interface LockedJobRow {
  artifact_id: string;
  attempts: number;
  max_attempts: number;
  organization_id: string;
  status: string;
  version_id: string;
  version_status: string;
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export class ProcessingStore {
  private readonly pool: Pool;

  public constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }

  public async probe(): Promise<boolean> {
    try {
      return (
        (await this.pool.query<{ ready: number }>('select 1 as ready')).rows[0]
          ?.ready === 1
      );
    } catch {
      return false;
    }
  }

  public async listDispatchable(limit = 100): Promise<DispatchableJob[]> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `update version_processing_jobs
            set status = 'retryable_failed', available_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, updated_at = now(),
                last_error = 'The worker lease expired before completion.'
          where status = 'running' and lease_expires_at <= now()
            and attempts < max_attempts`,
      );
      const exhausted = await client.query<{
        artifact_id: string;
        organization_id: string;
        version_id: string;
      }>(
        `update version_processing_jobs j
            set status = 'permanently_failed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = 'lease_exhausted',
                last_error = 'All attempts ended with an expired worker lease.',
                updated_at = now()
           from document_versions v
          where j.version_id = v.id and j.status = 'running'
            and j.lease_expires_at <= now() and j.attempts >= j.max_attempts
        returning j.organization_id, j.version_id, v.artifact_id`,
      );
      for (const row of exhausted.rows) {
        await client.query(
          `update document_versions
              set status = 'failed', conflict_reason = null
            where id = $1`,
          [row.version_id],
        );
        await client.query(
          `update artifacts set scan_status = 'failed'
            where id = $1 and scan_status = 'pending'`,
          [row.artifact_id],
        );
        await insertOutcomeEvent(client, {
          failureCode: 'lease_exhausted',
          organizationId: row.organization_id,
          outcome: 'permanently_failed',
          versionId: row.version_id,
        });
      }
    });
    const result = await this.pool.query<{
      id: string;
      max_attempts: number;
      version_id: string;
    }>(
      `select id, version_id, max_attempts
         from version_processing_jobs
        where status in ('queued', 'retryable_failed')
          and available_at <= now() and attempts < max_attempts
        order by available_at, created_at, id
        limit $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      maxAttempts: row.max_attempts,
      versionId: row.version_id,
    }));
  }

  public async markDispatched(job: DispatchableJob): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `update version_processing_jobs
            set dispatched_at = now(), updated_at = now()
          where id = $1 and status in ('queued', 'retryable_failed')`,
        [job.id],
      );
      await client.query(
        `update outbox_events
            set status = 'published', published_at = now(), last_error = null
          where aggregate_id = $1 and event_type = 'version.processing_requested'
            and status = 'pending'`,
        [job.versionId],
      );
    });
  }

  public async claim(
    jobId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedProcessingJob | null> {
    const result = await this.pool.query<ClaimRow>(
      `with claimed as (
         update version_processing_jobs
            set status = 'running', attempts = attempts + 1,
                started_at = coalesce(started_at, now()), heartbeat_at = now(),
                lease_owner = $2,
                lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
                failure_code = null, last_error = null, updated_at = now()
          where id = $1 and status in ('queued', 'retryable_failed')
            and available_at <= now() and attempts < max_attempts
        returning *
       )
       select c.id, c.organization_id, c.version_id, c.attempts,
              c.max_attempts, c.trace_id, a.object_key as artifact_object_key,
              a.sha256 as artifact_sha256, a.byte_size as artifact_byte_size,
              a.extension, d.kind as file_type
         from claimed c
         join document_versions v on v.id = c.version_id
         join artifacts a on a.id = v.artifact_id
         join documents d on d.id = v.document_id`,
      [jobId, leaseOwner, leaseMilliseconds],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      artifactByteSize: Number(row.artifact_byte_size),
      artifactObjectKey: row.artifact_object_key,
      artifactSha256: row.artifact_sha256,
      attempts: row.attempts,
      extension: row.extension,
      fileType: row.file_type,
      id: row.id,
      maxAttempts: row.max_attempts,
      organizationId: row.organization_id,
      traceId: row.trace_id,
      versionId: row.version_id,
    };
  }

  public async heartbeat(
    jobId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `update version_processing_jobs
          set heartbeat_at = now(),
              lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
              updated_at = now()
        where id = $1 and status = 'running' and lease_owner = $2`,
      [jobId, leaseOwner, leaseMilliseconds],
    );
    return result.rowCount === 1;
  }

  public async complete(input: {
    job: ClaimedProcessingJob;
    leaseOwner: string;
    snapshotObjectKey: string;
    snapshotSha256: string;
    result: InspectionResult;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const job = await lockJob(client, input.job.id);
      if (!job) throw new Error('Processing job was not found.');
      const existing = await client.query<{
        snapshot_sha256: string;
        stable_hash: string;
      }>(
        `select snapshot_sha256, stable_hash from normalized_snapshots
          where version_id = $1`,
        [job.version_id],
      );
      if (existing.rows[0]) {
        if (
          existing.rows[0].snapshot_sha256 !== input.snapshotSha256 ||
          existing.rows[0].stable_hash !== input.result.snapshot.stable_hash
        ) {
          throw new Error('A deterministic snapshot conflict was detected.');
        }
        return;
      }
      if (job.status !== 'running') return;
      if (input.leaseOwner.length > 0) {
        const owner = await client.query<{ lease_owner: string | null }>(
          `select lease_owner from version_processing_jobs where id = $1`,
          [input.job.id],
        );
        if (owner.rows[0]?.lease_owner !== input.leaseOwner) {
          throw new Error(
            'The processing lease is no longer owned by this worker.',
          );
        }
      }

      const snapshot = input.result.snapshot;
      await client.query(
        `insert into normalized_snapshots
          (organization_id, version_id, object_key, schema_version,
           parser_version, file_type, snapshot_sha256, stable_hash,
           package_summary, warnings, unsupported_features,
           validation_error_count)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          job.organization_id,
          job.version_id,
          input.snapshotObjectKey,
          snapshot.schema_version,
          snapshot.parser_version,
          snapshot.file_type,
          input.snapshotSha256,
          snapshot.stable_hash,
          JSON.stringify(snapshot.package),
          JSON.stringify(snapshot.warnings),
          JSON.stringify(snapshot.unsupported_features),
          snapshot.validation_errors.length,
        ],
      );
      await applyTerminalOutcome(
        client,
        job,
        input.result.outcome,
        input.result.failure_code,
      );
    });
  }

  public async recordFailure(input: {
    error: string;
    failureCode: string;
    job: ClaimedProcessingJob;
    leaseOwner: string;
    retryable: boolean;
    retryAt: Date;
  }): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const job = await lockJob(client, input.job.id);
      if (!job || job.status !== 'running') return false;
      const owner = await client.query<{ lease_owner: string | null }>(
        `select lease_owner from version_processing_jobs where id = $1`,
        [input.job.id],
      );
      if (owner.rows[0]?.lease_owner !== input.leaseOwner) return false;
      const retry = input.retryable && job.attempts < job.max_attempts;
      if (retry) {
        await client.query(
          `update version_processing_jobs
              set status = 'retryable_failed', available_at = $2,
                  lease_owner = null, lease_expires_at = null,
                  heartbeat_at = null, failure_code = $3, last_error = $4,
                  updated_at = now()
            where id = $1`,
          [input.job.id, input.retryAt, input.failureCode, input.error],
        );
        return true;
      }
      await applyTerminalOutcome(
        client,
        job,
        'permanently_failed',
        input.failureCode,
        input.error,
      );
      return false;
    });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

async function lockJob(
  client: PoolClient,
  jobId: string,
): Promise<LockedJobRow | null> {
  const result = await client.query<LockedJobRow>(
    `select j.organization_id, j.version_id, j.status, j.attempts,
            j.max_attempts, v.artifact_id, v.status as version_status
       from version_processing_jobs j
       join document_versions v on v.id = j.version_id
      where j.id = $1 for update of j, v`,
    [jobId],
  );
  return result.rows[0] ?? null;
}

async function applyTerminalOutcome(
  client: PoolClient,
  job: LockedJobRow,
  outcome: 'completed' | 'permanently_failed' | 'quarantined',
  failureCode: string | null,
  error: string | null = null,
): Promise<void> {
  await client.query(
    `update version_processing_jobs
        set status = $2::processing_job_status, completed_at = now(), lease_owner = null,
            lease_expires_at = null, heartbeat_at = null,
            failure_code = $3, last_error = $4, updated_at = now()
      where version_id = $1`,
    [job.version_id, outcome, failureCode, error],
  );
  const versionStatus =
    outcome === 'completed'
      ? job.version_status === 'conflicted'
        ? 'conflicted'
        : 'ready'
      : outcome === 'quarantined'
        ? 'quarantined'
        : 'failed';
  await client.query(
    `update document_versions
        set status = $2::version_status,
            conflict_reason = case when $2::version_status = 'conflicted' then conflict_reason else null end
      where id = $1`,
    [job.version_id, versionStatus],
  );
  const scanStatus =
    outcome === 'completed'
      ? 'clean'
      : outcome === 'quarantined'
        ? 'quarantined'
        : 'failed';
  await client.query(
    `update artifacts
        set scan_status = case
          when $2::artifact_scan_status = 'quarantined' then 'quarantined'
          when $2::artifact_scan_status = 'clean' and scan_status <> 'quarantined' then 'clean'
          when $2::artifact_scan_status = 'failed' and scan_status = 'pending' then 'failed'
          else scan_status
        end
      where id = $1`,
    [job.artifact_id, scanStatus],
  );
  await insertOutcomeEvent(client, {
    failureCode,
    organizationId: job.organization_id,
    outcome,
    versionId: job.version_id,
  });
}

async function insertOutcomeEvent(
  client: PoolClient,
  input: {
    failureCode: string | null;
    organizationId: string;
    outcome: string;
    versionId: string;
  },
): Promise<void> {
  await client.query(
    `insert into outbox_events
      (organization_id, aggregate_type, aggregate_id, event_type, payload)
     values ($1, 'document_version', $2, 'version.processing_finished', $3)`,
    [
      input.organizationId,
      input.versionId,
      JSON.stringify({
        failureCode: input.failureCode,
        outcome: input.outcome,
        versionId: input.versionId,
      }),
    ],
  );
}
