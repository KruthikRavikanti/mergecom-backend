import { Pool, type PoolClient } from 'pg';

import type {
  ClaimedComparisonJob,
  ClaimedMergeJob,
  ClaimedProcessingJob,
  ComparisonResult,
  DispatchableComparison,
  DispatchableJob,
  DispatchableMerge,
  InspectionResult,
  MergeResult,
} from './types';

interface MergeClaimRow {
  attempts: number;
  base_byte_size: string | number;
  base_extension: string;
  base_object_key: string;
  base_sha256: string;
  base_version_id: string;
  branch_id: string;
  document_id: string;
  engine_version: string;
  file_type: ClaimedMergeJob['fileType'];
  id: string;
  max_attempts: number;
  merge_schema_version: string;
  note: string;
  organization_id: string;
  ours_byte_size: string | number;
  ours_detected_media_type: string;
  ours_extension: string;
  ours_object_key: string;
  ours_original_filename: string;
  ours_sha256: string;
  ours_version_id: string;
  parser_version: string;
  requested_by_user_id: string;
  theirs_byte_size: string | number;
  theirs_extension: string;
  theirs_object_key: string;
  theirs_sha256: string;
  theirs_version_id: string;
  trace_id: string;
}

interface LockedMergeRow {
  attempts: number;
  branch_id: string;
  candidate_byte_size: string | number | null;
  candidate_object_key: string | null;
  candidate_sha256: string | null;
  document_id: string;
  engine_version: string;
  lease_owner: string | null;
  max_attempts: number;
  merge_schema_version: string;
  organization_id: string;
  ours_version_id: string;
  parser_version: string;
  result_version_id: string | null;
  stable_hash: string | null;
  status: string;
}

interface ComparisonClaimRow {
  attempts: number;
  base_byte_size: string | number;
  base_extension: string;
  base_object_key: string;
  base_sha256: string;
  base_version_id: string;
  comparison_schema_version: string;
  engine_version: string;
  file_type: ClaimedComparisonJob['fileType'];
  id: string;
  max_attempts: number;
  organization_id: string;
  parser_version: string;
  target_byte_size: string | number;
  target_extension: string;
  target_object_key: string;
  target_sha256: string;
  target_version_id: string;
  trace_id: string;
}

interface LockedComparisonRow {
  attempts: number;
  comparison_schema_version: string;
  engine_version: string;
  lease_owner: string | null;
  max_attempts: number;
  organization_id: string;
  parser_version: string;
  result_object_key: string | null;
  result_sha256: string | null;
  stable_hash: string | null;
  status: string;
}

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

  public constructor(
    databaseUrl: string,
    private readonly organizationQuotaBytes = 5 * 1024 * 1024 * 1024,
  ) {
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

  public async listDispatchableComparisons(
    limit = 100,
  ): Promise<DispatchableComparison[]> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `update version_comparisons
            set status = 'retryable_failed', available_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, updated_at = now(),
                last_error = 'The worker lease expired before completion.'
          where status = 'running' and lease_expires_at <= now()
            and attempts < max_attempts`,
      );
      const exhausted = await client.query<{
        id: string;
        organization_id: string;
      }>(
        `update version_comparisons
            set status = 'permanently_failed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = 'lease_exhausted',
                last_error = 'All attempts ended with an expired worker lease.',
                updated_at = now()
          where status = 'running' and lease_expires_at <= now()
            and attempts >= max_attempts
        returning id, organization_id`,
      );
      for (const row of exhausted.rows) {
        await insertComparisonOutcomeEvent(client, {
          comparisonId: row.id,
          failureCode: 'lease_exhausted',
          organizationId: row.organization_id,
          outcome: 'permanently_failed',
        });
      }
    });
    const result = await this.pool.query<{
      id: string;
      max_attempts: number;
    }>(
      `select id, max_attempts
         from version_comparisons
        where status in ('queued', 'retryable_failed')
          and available_at <= now() and attempts < max_attempts
        order by available_at, created_at, id
        limit $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      maxAttempts: row.max_attempts,
    }));
  }

  public async markComparisonDispatched(
    comparison: DispatchableComparison,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `update version_comparisons
            set dispatched_at = now(), updated_at = now()
          where id = $1 and status in ('queued', 'retryable_failed')`,
        [comparison.id],
      );
      await client.query(
        `update outbox_events
            set status = 'published', published_at = now(), last_error = null
          where aggregate_id = $1 and event_type = 'version.comparison_requested'
            and status = 'pending'`,
        [comparison.id],
      );
    });
  }

  public async listDispatchableMerges(
    limit = 100,
  ): Promise<DispatchableMerge[]> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `update merge_operations
            set status = 'retryable_failed', available_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, updated_at = now(),
                last_error = 'The worker lease expired before completion.'
          where status = 'running' and lease_expires_at <= now()
            and attempts < max_attempts`,
      );
      const exhausted = await client.query<{
        id: string;
        organization_id: string;
      }>(
        `update merge_operations
            set status = 'permanently_failed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = 'lease_exhausted',
                last_error = 'All attempts ended with an expired worker lease.',
                updated_at = now()
          where status = 'running' and lease_expires_at <= now()
            and attempts >= max_attempts
        returning id, organization_id`,
      );
      for (const row of exhausted.rows) {
        await insertMergeOutcomeEvent(client, {
          failureCode: 'lease_exhausted',
          mergeId: row.id,
          organizationId: row.organization_id,
          outcome: 'permanently_failed',
          resultVersionId: null,
        });
      }
    });
    const result = await this.pool.query<{
      id: string;
      max_attempts: number;
    }>(
      `select id, max_attempts
         from merge_operations
        where status in ('queued', 'retryable_failed')
          and available_at <= now() and attempts < max_attempts
        order by available_at, created_at, id
        limit $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      maxAttempts: row.max_attempts,
    }));
  }

  public async markMergeDispatched(merge: DispatchableMerge): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `update merge_operations
            set dispatched_at = now(), updated_at = now()
          where id = $1 and status in ('queued', 'retryable_failed')`,
        [merge.id],
      );
      await client.query(
        `update outbox_events
            set status = 'published', published_at = now(), last_error = null
          where aggregate_id = $1 and event_type = 'version.merge_requested'
            and status = 'pending'`,
        [merge.id],
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

  public async claimComparison(
    comparisonId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedComparisonJob | null> {
    const result = await this.pool.query<ComparisonClaimRow>(
      `with claimed as (
         update version_comparisons
            set status = 'running', attempts = attempts + 1,
                started_at = coalesce(started_at, now()), heartbeat_at = now(),
                lease_owner = $2,
                lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
                failure_code = null, last_error = null, updated_at = now()
          where id = $1 and status in ('queued', 'retryable_failed')
            and available_at <= now() and attempts < max_attempts
        returning *
       )
       select c.id, c.organization_id, c.attempts, c.max_attempts,
              c.trace_id, c.comparison_schema_version, c.parser_version,
              c.engine_version, d.kind as file_type,
              bv.id as base_version_id, ba.object_key as base_object_key,
              ba.sha256 as base_sha256, ba.byte_size as base_byte_size,
              ba.extension as base_extension,
              tv.id as target_version_id, ta.object_key as target_object_key,
              ta.sha256 as target_sha256, ta.byte_size as target_byte_size,
              ta.extension as target_extension
         from claimed c
         join documents d on d.id = c.document_id
         join document_versions bv on bv.id = c.base_version_id
         join artifacts ba on ba.id = bv.artifact_id
         join document_versions tv on tv.id = c.target_version_id
         join artifacts ta on ta.id = tv.artifact_id`,
      [comparisonId, leaseOwner, leaseMilliseconds],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      attempts: row.attempts,
      baseArtifact: {
        byteSize: Number(row.base_byte_size),
        extension: row.base_extension,
        objectKey: row.base_object_key,
        sha256: row.base_sha256,
        versionId: row.base_version_id,
      },
      comparisonSchemaVersion: row.comparison_schema_version,
      engineVersion: row.engine_version,
      fileType: row.file_type,
      id: row.id,
      maxAttempts: row.max_attempts,
      organizationId: row.organization_id,
      parserVersion: row.parser_version,
      targetArtifact: {
        byteSize: Number(row.target_byte_size),
        extension: row.target_extension,
        objectKey: row.target_object_key,
        sha256: row.target_sha256,
        versionId: row.target_version_id,
      },
      traceId: row.trace_id,
    };
  }

  public async heartbeatComparison(
    comparisonId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `update version_comparisons
          set heartbeat_at = now(),
              lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
              updated_at = now()
        where id = $1 and status = 'running' and lease_owner = $2`,
      [comparisonId, leaseOwner, leaseMilliseconds],
    );
    return result.rowCount === 1;
  }

  public async claimMerge(
    mergeId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedMergeJob | null> {
    const result = await this.pool.query<MergeClaimRow>(
      `with claimed as (
         update merge_operations
            set status = 'running', attempts = attempts + 1,
                started_at = coalesce(started_at, now()), heartbeat_at = now(),
                lease_owner = $2,
                lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
                failure_code = null, last_error = null, updated_at = now()
          where id = $1 and status in ('queued', 'retryable_failed')
            and available_at <= now() and attempts < max_attempts
        returning *
       )
       select m.id, m.organization_id, m.document_id, m.branch_id,
              m.requested_by_user_id, m.note, m.attempts, m.max_attempts,
              m.trace_id, m.merge_schema_version, m.parser_version,
              m.engine_version, d.kind as file_type,
              bv.id as base_version_id, ba.object_key as base_object_key,
              ba.sha256 as base_sha256, ba.byte_size as base_byte_size,
              ba.extension as base_extension,
              ov.id as ours_version_id, oa.object_key as ours_object_key,
              oa.sha256 as ours_sha256, oa.byte_size as ours_byte_size,
              oa.extension as ours_extension,
              oa.detected_media_type as ours_detected_media_type,
              oa.original_filename as ours_original_filename,
              tv.id as theirs_version_id, ta.object_key as theirs_object_key,
              ta.sha256 as theirs_sha256, ta.byte_size as theirs_byte_size,
              ta.extension as theirs_extension
         from claimed m
         join documents d on d.id = m.document_id
         join document_versions bv on bv.id = m.base_version_id
         join artifacts ba on ba.id = bv.artifact_id
         join document_versions ov on ov.id = m.ours_version_id
         join artifacts oa on oa.id = ov.artifact_id
         join document_versions tv on tv.id = m.theirs_version_id
         join artifacts ta on ta.id = tv.artifact_id`,
      [mergeId, leaseOwner, leaseMilliseconds],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      attempts: row.attempts,
      baseArtifact: {
        byteSize: Number(row.base_byte_size),
        extension: row.base_extension,
        objectKey: row.base_object_key,
        sha256: row.base_sha256,
        versionId: row.base_version_id,
      },
      branchId: row.branch_id,
      documentId: row.document_id,
      engineVersion: row.engine_version,
      fileType: row.file_type,
      id: row.id,
      maxAttempts: row.max_attempts,
      mergeSchemaVersion: row.merge_schema_version,
      note: row.note,
      organizationId: row.organization_id,
      oursArtifact: {
        byteSize: Number(row.ours_byte_size),
        detectedMediaType: row.ours_detected_media_type,
        extension: row.ours_extension,
        objectKey: row.ours_object_key,
        originalFilename: row.ours_original_filename,
        sha256: row.ours_sha256,
        versionId: row.ours_version_id,
      },
      parserVersion: row.parser_version,
      requestedByUserId: row.requested_by_user_id,
      theirsArtifact: {
        byteSize: Number(row.theirs_byte_size),
        extension: row.theirs_extension,
        objectKey: row.theirs_object_key,
        sha256: row.theirs_sha256,
        versionId: row.theirs_version_id,
      },
      traceId: row.trace_id,
    };
  }

  public async heartbeatMerge(
    mergeId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `update merge_operations
          set heartbeat_at = now(),
              lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
              updated_at = now()
        where id = $1 and status = 'running' and lease_owner = $2`,
      [mergeId, leaseOwner, leaseMilliseconds],
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

  public async completeComparison(input: {
    comparison: ClaimedComparisonJob;
    leaseOwner: string;
    result: ComparisonResult;
    resultObjectKey: string;
    resultSha256: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const comparison = await lockComparison(client, input.comparison.id);
      if (!comparison) throw new Error('Comparison was not found.');
      if (comparison.result_object_key) {
        if (
          comparison.result_object_key !== input.resultObjectKey ||
          comparison.result_sha256 !== input.resultSha256 ||
          comparison.stable_hash !== input.result.stable_hash
        ) {
          throw new Error('A deterministic comparison conflict was detected.');
        }
        return;
      }
      if (comparison.status !== 'running') return;
      if (comparison.lease_owner !== input.leaseOwner) {
        throw new Error(
          'The comparison lease is no longer owned by this worker.',
        );
      }
      if (
        comparison.comparison_schema_version !==
          input.result.comparison_schema_version ||
        comparison.parser_version !== input.result.parser_version ||
        comparison.engine_version !== input.result.engine_version
      ) {
        throw new Error('The comparison result version contract changed.');
      }

      const changes = input.result.changes.map((change) => ({
        after: change.after,
        before: change.before,
        category: change.category,
        changeType: change.change_type,
        entityType: change.entity_type,
        id: change.id,
        impact: change.impact,
        label: change.label,
        path: change.path,
      }));
      await client.query(
        `update version_comparisons
            set status = 'completed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = null, last_error = null,
                result_object_key = $2, result_sha256 = $3, stable_hash = $4,
                byte_equal = $5, semantic_equal = $6, completeness = $7,
                summary = $8, warnings = $9, changes = $10,
                updated_at = now()
          where id = $1`,
        [
          input.comparison.id,
          input.resultObjectKey,
          input.resultSha256,
          input.result.stable_hash,
          input.result.byte_equal,
          input.result.semantic_equal,
          input.result.completeness,
          JSON.stringify(input.result.summary),
          JSON.stringify(input.result.warnings),
          JSON.stringify(changes),
        ],
      );
      await insertComparisonOutcomeEvent(client, {
        comparisonId: input.comparison.id,
        failureCode: null,
        organizationId: comparison.organization_id,
        outcome: 'completed',
      });
    });
  }

  public async recordComparisonFailure(input: {
    comparison: ClaimedComparisonJob;
    error: string;
    failureCode: string;
    leaseOwner: string;
    retryable: boolean;
    retryAt: Date;
  }): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const comparison = await lockComparison(client, input.comparison.id);
      if (!comparison || comparison.status !== 'running') return false;
      if (comparison.lease_owner !== input.leaseOwner) return false;
      const retry =
        input.retryable && comparison.attempts < comparison.max_attempts;
      if (retry) {
        await client.query(
          `update version_comparisons
              set status = 'retryable_failed', available_at = $2,
                  lease_owner = null, lease_expires_at = null,
                  heartbeat_at = null, failure_code = $3, last_error = $4,
                  updated_at = now()
            where id = $1`,
          [input.comparison.id, input.retryAt, input.failureCode, input.error],
        );
        return true;
      }
      await client.query(
        `update version_comparisons
            set status = 'permanently_failed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = $2, last_error = $3,
                updated_at = now()
          where id = $1`,
        [input.comparison.id, input.failureCode, input.error],
      );
      await insertComparisonOutcomeEvent(client, {
        comparisonId: input.comparison.id,
        failureCode: input.failureCode,
        organizationId: comparison.organization_id,
        outcome: 'permanently_failed',
      });
      return false;
    });
  }

  public async completeMerge(input: {
    candidateObjectKey: string | null;
    leaseOwner: string;
    merge: ClaimedMergeJob;
    result: MergeResult;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const merge = await lockMerge(client, input.merge.id);
      if (!merge) throw new Error('Merge operation was not found.');
      if (merge.status !== 'running') return;
      if (merge.lease_owner !== input.leaseOwner) {
        throw new Error('The merge lease is no longer owned by this worker.');
      }
      if (
        merge.merge_schema_version !== input.result.merge_schema_version ||
        merge.parser_version !== input.result.parser_version ||
        merge.engine_version !== input.result.engine_version
      ) {
        throw new Error('The merge result version contract changed.');
      }
      const candidate = input.result.candidate_bytes;
      if (
        (candidate === null) !== (input.candidateObjectKey === null) ||
        (candidate === null) !== (input.result.candidate_sha256 === null)
      ) {
        throw new Error('The merge candidate storage contract is invalid.');
      }

      if (input.result.outcome === 'manual_resolution_required') {
        await client.query(
          `update merge_operations
              set status = 'manual_resolution_required', completed_at = now(),
                  lease_owner = null, lease_expires_at = null,
                  heartbeat_at = null, failure_code = $2, last_error = null,
                  strategy = $3, stable_hash = $4, warnings = $5,
                  applied_paths = $6, candidate_object_key = $7,
                  candidate_sha256 = $8, candidate_byte_size = $9,
                  analysis = $10,
                  updated_at = now()
            where id = $1`,
          [
            input.merge.id,
            input.result.failure_code,
            input.result.strategy,
            input.result.stable_hash,
            JSON.stringify(input.result.warnings),
            JSON.stringify(input.result.applied_paths),
            input.candidateObjectKey,
            input.result.candidate_sha256,
            input.result.candidate_byte_size,
            JSON.stringify(apiMergeAnalysis(input.result.analysis)),
          ],
        );
        await insertMergeOutcomeEvent(client, {
          failureCode: input.result.failure_code,
          mergeId: input.merge.id,
          organizationId: merge.organization_id,
          outcome: 'manual_resolution_required',
          resultVersionId: null,
        });
        return;
      }

      if (
        !candidate ||
        !input.candidateObjectKey ||
        !input.result.candidate_sha256 ||
        !input.result.candidate_byte_size
      ) {
        throw new Error('A completed merge requires a stored candidate.');
      }
      const branch = await client.query<{ head_version_id: string | null }>(
        `select head_version_id from document_branches
          where id = $1 and organization_id = $2 and document_id = $3
          for update`,
        [merge.branch_id, merge.organization_id, merge.document_id],
      );
      if (branch.rows[0]?.head_version_id !== merge.ours_version_id) {
        const warnings = [
          ...input.result.warnings,
          'The branch head changed before the candidate could be published.',
        ];
        await client.query(
          `update merge_operations
              set status = 'manual_resolution_required', completed_at = now(),
                  lease_owner = null, lease_expires_at = null,
                  heartbeat_at = null, failure_code = 'branch_head_changed',
                  last_error = null, strategy = $2, stable_hash = $3,
                  warnings = $4, applied_paths = $5,
                  candidate_object_key = $6, candidate_sha256 = $7,
                  candidate_byte_size = $8, analysis = $9, updated_at = now()
            where id = $1`,
          [
            input.merge.id,
            input.result.strategy,
            input.result.stable_hash,
            JSON.stringify(warnings),
            JSON.stringify(input.result.applied_paths),
            input.candidateObjectKey,
            input.result.candidate_sha256,
            input.result.candidate_byte_size,
            JSON.stringify(apiMergeAnalysis(input.result.analysis)),
          ],
        );
        await insertMergeOutcomeEvent(client, {
          failureCode: 'branch_head_changed',
          mergeId: input.merge.id,
          organizationId: merge.organization_id,
          outcome: 'manual_resolution_required',
          resultVersionId: null,
        });
        return;
      }

      await client.query(
        'select 1 from organizations where id = $1 for update',
        [merge.organization_id],
      );
      const usage = await client.query<{ used: string }>(
        `select coalesce(sum(byte_size), 0)::text as used
           from artifacts where organization_id = $1`,
        [merge.organization_id],
      );
      if (
        Number(usage.rows[0]?.used ?? 0) + input.result.candidate_byte_size >
        this.organizationQuotaBytes
      ) {
        const warnings = [
          ...input.result.warnings,
          'Publishing the merge would exceed the workspace storage quota.',
        ];
        await client.query(
          `update merge_operations
              set status = 'manual_resolution_required', completed_at = now(),
                  lease_owner = null, lease_expires_at = null,
                  heartbeat_at = null, failure_code = 'merge_quota_exceeded',
                  last_error = null, strategy = $2, stable_hash = $3,
                  warnings = $4, applied_paths = $5,
                  candidate_object_key = $6, candidate_sha256 = $7,
                  candidate_byte_size = $8, analysis = $9, updated_at = now()
            where id = $1`,
          [
            input.merge.id,
            input.result.strategy,
            input.result.stable_hash,
            JSON.stringify(warnings),
            JSON.stringify(input.result.applied_paths),
            input.candidateObjectKey,
            input.result.candidate_sha256,
            input.result.candidate_byte_size,
            JSON.stringify(apiMergeAnalysis(input.result.analysis)),
          ],
        );
        await insertMergeOutcomeEvent(client, {
          failureCode: 'merge_quota_exceeded',
          mergeId: input.merge.id,
          organizationId: merge.organization_id,
          outcome: 'manual_resolution_required',
          resultVersionId: null,
        });
        return;
      }

      const artifact = await client.query<{ id: string }>(
        `insert into artifacts
          (organization_id, object_key, sha256, byte_size, detected_media_type,
           original_filename, extension, created_by_user_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          merge.organization_id,
          input.candidateObjectKey,
          input.result.candidate_sha256,
          input.result.candidate_byte_size,
          input.merge.oursArtifact.detectedMediaType,
          input.merge.oursArtifact.originalFilename,
          input.merge.oursArtifact.extension,
          input.merge.requestedByUserId,
        ],
      );
      const artifactId = artifact.rows[0]?.id;
      if (!artifactId) throw new Error('Merge artifact creation failed.');
      const sequence = await client.query<{ value: number }>(
        `select coalesce(max(sequence), 0)::int + 1 as value
           from document_versions where branch_id = $1`,
        [merge.branch_id],
      );
      const nextSequence = sequence.rows[0]?.value;
      if (!nextSequence)
        throw new Error('Merge version sequence allocation failed.');
      const version = await client.query<{ id: string }>(
        `insert into document_versions
          (organization_id, document_id, branch_id, artifact_id, sequence,
           display_number, parent_version_id, merge_parent_version_id,
           base_version_id, source, status, note, author_user_id)
         values ($1, $2, $3, $4, $5, $5, $6, $7, $8, 'merge',
                 'pending_processing', $9, $10)
         returning id`,
        [
          merge.organization_id,
          merge.document_id,
          merge.branch_id,
          artifactId,
          nextSequence,
          input.merge.oursArtifact.versionId,
          input.merge.theirsArtifact.versionId,
          input.merge.baseArtifact.versionId,
          input.merge.note,
          input.merge.requestedByUserId,
        ],
      );
      const resultVersionId = version.rows[0]?.id;
      if (!resultVersionId) throw new Error('Merge version creation failed.');
      const advanced = await client.query(
        `update document_branches set head_version_id = $2, updated_at = now()
          where id = $1 and head_version_id = $3`,
        [merge.branch_id, resultVersionId, merge.ours_version_id],
      );
      if (advanced.rowCount !== 1) {
        throw new Error('Merge branch compare-and-swap failed under lock.');
      }
      await client.query(
        `insert into version_processing_jobs
          (organization_id, version_id, job_type)
         values ($1, $2, 'semantic_ingestion')`,
        [merge.organization_id, resultVersionId],
      );
      await client.query(
        `insert into outbox_events
          (organization_id, aggregate_type, aggregate_id, event_type, payload)
         values ($1, 'document_version', $2, 'version.processing_requested', $3)`,
        [
          merge.organization_id,
          resultVersionId,
          JSON.stringify({ versionId: resultVersionId }),
        ],
      );
      await client.query(
        `update merge_operations
            set status = 'completed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = null, last_error = null,
                strategy = $2, stable_hash = $3, warnings = $4,
                applied_paths = $5, candidate_object_key = $6,
                candidate_sha256 = $7, candidate_byte_size = $8,
                result_version_id = $9, analysis = $10, updated_at = now()
          where id = $1`,
        [
          input.merge.id,
          input.result.strategy,
          input.result.stable_hash,
          JSON.stringify(input.result.warnings),
          JSON.stringify(input.result.applied_paths),
          input.candidateObjectKey,
          input.result.candidate_sha256,
          input.result.candidate_byte_size,
          resultVersionId,
          JSON.stringify(apiMergeAnalysis(input.result.analysis)),
        ],
      );
      await insertMergeOutcomeEvent(client, {
        failureCode: null,
        mergeId: input.merge.id,
        organizationId: merge.organization_id,
        outcome: 'completed',
        resultVersionId,
      });
    });
  }

  public async recordMergeFailure(input: {
    error: string;
    failureCode: string;
    leaseOwner: string;
    merge: ClaimedMergeJob;
    retryable: boolean;
    retryAt: Date;
  }): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const merge = await lockMerge(client, input.merge.id);
      if (!merge || merge.status !== 'running') return false;
      if (merge.lease_owner !== input.leaseOwner) return false;
      const retry = input.retryable && merge.attempts < merge.max_attempts;
      if (retry) {
        await client.query(
          `update merge_operations
              set status = 'retryable_failed', available_at = $2,
                  lease_owner = null, lease_expires_at = null,
                  heartbeat_at = null, failure_code = $3, last_error = $4,
                  updated_at = now()
            where id = $1`,
          [input.merge.id, input.retryAt, input.failureCode, input.error],
        );
        return true;
      }
      await client.query(
        `update merge_operations
            set status = 'permanently_failed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = $2, last_error = $3,
                updated_at = now()
          where id = $1`,
        [input.merge.id, input.failureCode, input.error],
      );
      await insertMergeOutcomeEvent(client, {
        failureCode: input.failureCode,
        mergeId: input.merge.id,
        organizationId: merge.organization_id,
        outcome: 'permanently_failed',
        resultVersionId: null,
      });
      return false;
    });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

async function lockComparison(
  client: PoolClient,
  comparisonId: string,
): Promise<LockedComparisonRow | null> {
  const result = await client.query<LockedComparisonRow>(
    `select organization_id, status, attempts, max_attempts, lease_owner,
            comparison_schema_version, parser_version, engine_version,
            result_object_key, result_sha256, stable_hash
       from version_comparisons
      where id = $1 for update`,
    [comparisonId],
  );
  return result.rows[0] ?? null;
}

function apiMergeAnalysis(analysis: MergeResult['analysis']) {
  return {
    automaticMergeEligible: analysis.automatic_merge_eligible,
    automaticMergeEnabled: analysis.automatic_merge_enabled,
    blockers: analysis.blockers,
    items: analysis.items.map((item) => ({
      automaticallyResolved: item.automatically_resolved,
      category: item.category,
      classification: item.classification,
      confidence: item.confidence,
      explanation: item.explanation,
      id: item.id,
      label: item.label,
      oursChange: item.ours_change,
      path: item.path,
      theirsChange: item.theirs_change,
    })),
    schemaVersion: analysis.schema_version,
    summary: analysis.summary,
  };
}

async function lockMerge(
  client: PoolClient,
  mergeId: string,
): Promise<LockedMergeRow | null> {
  const result = await client.query<LockedMergeRow>(
    `select organization_id, document_id, branch_id, ours_version_id,
            status, attempts, max_attempts, lease_owner,
            merge_schema_version, parser_version, engine_version,
            candidate_object_key, candidate_sha256, candidate_byte_size,
            stable_hash, result_version_id
       from merge_operations
      where id = $1 for update`,
    [mergeId],
  );
  return result.rows[0] ?? null;
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

async function insertComparisonOutcomeEvent(
  client: PoolClient,
  input: {
    comparisonId: string;
    failureCode: string | null;
    organizationId: string;
    outcome: string;
  },
): Promise<void> {
  await client.query(
    `insert into outbox_events
      (organization_id, aggregate_type, aggregate_id, event_type, payload)
     values ($1, 'version_comparison', $2, 'version.comparison_finished', $3)`,
    [
      input.organizationId,
      input.comparisonId,
      JSON.stringify({
        comparisonId: input.comparisonId,
        failureCode: input.failureCode,
        outcome: input.outcome,
      }),
    ],
  );
}

async function insertMergeOutcomeEvent(
  client: PoolClient,
  input: {
    failureCode: string | null;
    mergeId: string;
    organizationId: string;
    outcome: string;
    resultVersionId: string | null;
  },
): Promise<void> {
  await client.query(
    `insert into outbox_events
      (organization_id, aggregate_type, aggregate_id, event_type, payload)
     values ($1, 'merge_operation', $2, 'version.merge_finished', $3)`,
    [
      input.organizationId,
      input.mergeId,
      JSON.stringify({
        failureCode: input.failureCode,
        mergeId: input.mergeId,
        outcome: input.outcome,
        resultVersionId: input.resultVersionId,
      }),
    ],
  );
}
