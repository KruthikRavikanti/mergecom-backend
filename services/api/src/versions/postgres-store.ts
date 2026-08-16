import { createHash } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import {
  canWriteProjectContent,
  effectiveProjectRole,
} from '../projects/authorization';
import type { PageInput } from '../projects/store';
import type { DocumentKind, ProjectRole } from '../projects/types';
import {
  VersionOperationError,
  type AuthorizedArtifact,
  type AuthorizedMergeCandidate,
  type CreatedUploadRecord,
  type FinalizedArtifactInput,
  type VersionStore,
} from './store';
import type {
  BranchSummary,
  ComparisonChange,
  DocumentAccess,
  DocumentMerge,
  DocumentVersionSummary,
  ExpiredUpload,
  FinalizeVersionResult,
  StagedUploadRecord,
  UploadMode,
  VersionActor,
  VersionComparison,
  VersionPage,
  ProcessingJobStatus,
  ProcessingWarning,
  VersionSource,
  VersionStatus,
} from './types';

interface AccessRow {
  branch_head_version_id: string | null;
  branch_id: string;
  branch_name: string;
  document_archived_at: Date | null;
  document_kind: DocumentKind;
  project_archived_at: Date | null;
  project_role: ProjectRole | null;
}

interface UploadRow {
  base_version_id: string | null;
  branch_id: string;
  client_media_type: string | null;
  created_at: Date;
  created_by_user_id: string;
  document_id: string;
  expected_byte_size: string | number;
  expected_sha256: string;
  expires_at: Date;
  extension: string;
  finalized_version_id: string | null;
  id: string;
  mode: UploadMode;
  multipart_upload_id: string | null;
  original_filename: string;
  part_size: number | null;
  staging_object_key: string;
  status: StagedUploadRecord['status'];
}

interface VersionRow {
  artifact_byte_size: string | number;
  artifact_detected_media_type: string;
  artifact_extension: string;
  artifact_id: string;
  artifact_object_key: string;
  artifact_original_filename: string;
  artifact_scan_status: DocumentVersionSummary['artifact']['scanStatus'];
  artifact_sha256: string;
  artifact_storage_checksum: string | null;
  artifact_storage_version: string | null;
  author_id: string;
  author_name: string;
  base_version_id: string | null;
  branch_id: string;
  conflict_reason: string | null;
  created_at: Date;
  display_number: number;
  document_id: string;
  id: string;
  merge_parent_version_id: string | null;
  note: string;
  parent_version_id: string | null;
  processing_attempts: number;
  processing_available_at: Date;
  processing_failure_code: string | null;
  processing_max_attempts: number;
  processing_status: ProcessingJobStatus;
  processing_trace_id: string;
  processing_updated_at: Date;
  sequence: number;
  source: VersionSource;
  status: VersionStatus;
  snapshot_package_summary: Record<string, boolean | number> | null;
  snapshot_parser_version: string | null;
  snapshot_schema_version: string | null;
  snapshot_stable_hash: string | null;
  snapshot_unsupported_features: string[] | null;
  snapshot_validation_error_count: number | null;
  snapshot_warnings: ProcessingWarning[] | null;
}

interface ComparisonRow {
  attempts: number;
  available_at: Date;
  base_artifact_sha256: string;
  base_author_name: string;
  base_created_at: Date;
  base_display_number: number;
  base_note: string;
  base_version_id: string;
  byte_equal: boolean | null;
  changes: ComparisonChange[];
  comparison_schema_version: string;
  completeness: 'complete' | 'partial' | null;
  created_at: Date;
  engine_version: string;
  failure_code: string | null;
  id: string;
  max_attempts: number;
  parser_version: string;
  semantic_equal: boolean | null;
  stable_hash: string | null;
  status: ProcessingJobStatus;
  summary: Record<string, number>;
  target_artifact_sha256: string;
  target_author_name: string;
  target_created_at: Date;
  target_display_number: number;
  target_note: string;
  target_version_id: string;
  trace_id: string;
  updated_at: Date;
  warnings: string[];
}

interface MergeRow {
  analysis: DocumentMerge['analysis'];
  applied_paths: string[];
  attempts: number;
  available_at: Date;
  base_artifact_sha256: string;
  base_author_name: string;
  base_created_at: Date;
  base_display_number: number;
  base_note: string;
  base_status: VersionStatus;
  base_version_id: string;
  branch_id: string;
  candidate_byte_size: string | number | null;
  candidate_object_key: string | null;
  candidate_sha256: string | null;
  created_at: Date;
  engine_version: string;
  failure_code: string | null;
  id: string;
  max_attempts: number;
  merge_schema_version: string;
  note: string;
  ours_artifact_sha256: string;
  ours_author_name: string;
  ours_created_at: Date;
  ours_display_number: number;
  ours_note: string;
  ours_status: VersionStatus;
  ours_version_id: string;
  parser_version: string;
  result_version_id: string | null;
  stable_hash: string | null;
  status: DocumentMerge['state'];
  strategy: string | null;
  theirs_artifact_sha256: string;
  theirs_author_name: string;
  theirs_created_at: Date;
  theirs_display_number: number;
  theirs_note: string;
  theirs_status: VersionStatus;
  theirs_version_id: string;
  trace_id: string;
  updated_at: Date;
  warnings: string[];
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function mapBranch(row: AccessRow): BranchSummary {
  return {
    headVersionId: row.branch_head_version_id,
    id: row.branch_id,
    name: row.branch_name,
  };
}

function mapUpload(row: UploadRow): StagedUploadRecord {
  return {
    baseVersionId: row.base_version_id,
    branchId: row.branch_id,
    clientMediaType: row.client_media_type,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    documentId: row.document_id,
    expectedByteSize: Number(row.expected_byte_size),
    expectedSha256: row.expected_sha256,
    expiresAt: row.expires_at,
    extension: row.extension,
    finalizedVersionId: row.finalized_version_id,
    id: row.id,
    mode: row.mode,
    multipartUploadId: row.multipart_upload_id,
    originalFilename: row.original_filename,
    partSize: row.part_size,
    stagingObjectKey: row.staging_object_key,
    status: row.status,
  };
}

function mapVersion(row: VersionRow): DocumentVersionSummary {
  return {
    artifact: {
      byteSize: Number(row.artifact_byte_size),
      detectedMediaType: row.artifact_detected_media_type,
      extension: row.artifact_extension,
      id: row.artifact_id,
      originalFilename: row.artifact_original_filename,
      scanStatus: row.artifact_scan_status,
      sha256: row.artifact_sha256,
      storageChecksum: row.artifact_storage_checksum,
      storageVersion: row.artifact_storage_version,
    },
    author: { id: row.author_id, name: row.author_name },
    baseVersionId: row.base_version_id,
    branchId: row.branch_id,
    conflictReason: row.conflict_reason,
    createdAt: row.created_at,
    displayNumber: row.display_number,
    documentId: row.document_id,
    id: row.id,
    mergeParentVersionId: row.merge_parent_version_id,
    note: row.note,
    parentVersionId: row.parent_version_id,
    processing: {
      attempts: row.processing_attempts,
      failureCode: row.processing_failure_code,
      maxAttempts: row.processing_max_attempts,
      nextAttemptAt:
        row.processing_status === 'queued' ||
        row.processing_status === 'retryable_failed'
          ? row.processing_available_at
          : null,
      snapshot:
        row.snapshot_schema_version &&
        row.snapshot_parser_version &&
        row.snapshot_stable_hash &&
        row.snapshot_package_summary
          ? {
              package: row.snapshot_package_summary,
              parserVersion: row.snapshot_parser_version,
              schemaVersion: row.snapshot_schema_version,
              stableHash: row.snapshot_stable_hash,
              unsupportedFeatures: row.snapshot_unsupported_features ?? [],
              validationErrorCount: row.snapshot_validation_error_count ?? 0,
              warnings: row.snapshot_warnings ?? [],
            }
          : null,
      state: row.processing_status,
      supportTraceId: row.processing_trace_id,
      updatedAt: row.processing_updated_at,
    },
    sequence: row.sequence,
    source: row.source,
    status: row.status,
  };
}

function mapComparison(row: ComparisonRow): VersionComparison {
  return {
    attempts: row.attempts,
    baseVersion: {
      artifactSha256: row.base_artifact_sha256,
      authorName: row.base_author_name,
      createdAt: row.base_created_at,
      displayNumber: row.base_display_number,
      id: row.base_version_id,
      note: row.base_note,
    },
    byteEqual: row.byte_equal,
    changes: row.changes,
    comparisonSchemaVersion: row.comparison_schema_version,
    completeness: row.completeness,
    createdAt: row.created_at,
    engineVersion: row.engine_version,
    failureCode: row.failure_code,
    id: row.id,
    maxAttempts: row.max_attempts,
    nextAttemptAt:
      row.status === 'queued' || row.status === 'retryable_failed'
        ? row.available_at
        : null,
    parserVersion: row.parser_version,
    semanticEqual: row.semantic_equal,
    stableHash: row.stable_hash,
    state: row.status,
    summary: row.summary,
    supportTraceId: row.trace_id,
    targetVersion: {
      artifactSha256: row.target_artifact_sha256,
      authorName: row.target_author_name,
      createdAt: row.target_created_at,
      displayNumber: row.target_display_number,
      id: row.target_version_id,
      note: row.target_note,
    },
    updatedAt: row.updated_at,
    warnings: row.warnings,
  };
}

function mapMerge(row: MergeRow): DocumentMerge {
  const version = (
    prefix: 'base' | 'ours' | 'theirs',
  ): DocumentMerge['baseVersion'] => ({
    artifactSha256: row[`${prefix}_artifact_sha256`],
    authorName: row[`${prefix}_author_name`],
    createdAt: row[`${prefix}_created_at`],
    displayNumber: row[`${prefix}_display_number`],
    id: row[`${prefix}_version_id`],
    note: row[`${prefix}_note`],
    status: row[`${prefix}_status`],
  });
  return {
    analysis: row.analysis,
    appliedPaths: row.applied_paths,
    attempts: row.attempts,
    baseVersion: version('base'),
    branchId: row.branch_id,
    candidate:
      row.candidate_sha256 && row.candidate_byte_size !== null
        ? {
            byteSize: Number(row.candidate_byte_size),
            sha256: row.candidate_sha256,
          }
        : null,
    createdAt: row.created_at,
    engineVersion: row.engine_version,
    failureCode: row.failure_code,
    id: row.id,
    maxAttempts: row.max_attempts,
    mergeSchemaVersion: row.merge_schema_version,
    nextAttemptAt:
      row.status === 'queued' || row.status === 'retryable_failed'
        ? row.available_at
        : null,
    note: row.note,
    oursVersion: version('ours'),
    parserVersion: row.parser_version,
    resultVersionId: row.result_version_id,
    stableHash: row.stable_hash,
    state: row.status,
    strategy: row.strategy,
    supportTraceId: row.trace_id,
    theirsVersion: version('theirs'),
    updatedAt: row.updated_at,
    warnings: row.warnings,
  };
}

function encodeVersionCursor(row: VersionRow): string {
  return Buffer.from(
    JSON.stringify({ id: row.id, sequence: row.sequence }),
  ).toString('base64url');
}

function decodeVersionCursor(cursor: string): { id: string; sequence: number } {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { id?: unknown; sequence?: unknown };
    if (
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(parsed.id) ||
      !Number.isInteger(parsed.sequence) ||
      Number(parsed.sequence) <= 0
    ) {
      throw new Error('Invalid cursor fields.');
    }
    return { id: parsed.id, sequence: Number(parsed.sequence) };
  } catch {
    throw new VersionOperationError('invalid_cursor');
  }
}

async function inTransaction<T>(
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

const uploadColumns = `
  id, document_id, branch_id, base_version_id, staging_object_key,
  expected_sha256, expected_byte_size, client_media_type, original_filename,
  extension, mode, multipart_upload_id, part_size, status,
  finalized_version_id, created_by_user_id, expires_at, created_at`;

const versionColumns = `
  v.id, v.document_id, v.branch_id, v.sequence, v.display_number,
  v.parent_version_id, v.merge_parent_version_id, v.base_version_id,
  v.source, v.status, v.note, v.conflict_reason, v.created_at,
  u.id as author_id, u.display_name as author_name,
  a.id as artifact_id, a.object_key as artifact_object_key,
  a.sha256 as artifact_sha256, a.byte_size as artifact_byte_size,
  a.detected_media_type as artifact_detected_media_type,
  a.original_filename as artifact_original_filename,
  a.extension as artifact_extension, a.scan_status as artifact_scan_status,
  a.storage_version as artifact_storage_version,
  a.storage_checksum as artifact_storage_checksum,
  j.status as processing_status, j.attempts as processing_attempts,
  j.max_attempts as processing_max_attempts,
  j.available_at as processing_available_at,
  j.failure_code as processing_failure_code, j.trace_id as processing_trace_id,
  j.updated_at as processing_updated_at,
  s.schema_version as snapshot_schema_version,
  s.parser_version as snapshot_parser_version,
  s.stable_hash as snapshot_stable_hash,
  s.package_summary as snapshot_package_summary,
  s.warnings as snapshot_warnings,
  s.unsupported_features as snapshot_unsupported_features,
  s.validation_error_count as snapshot_validation_error_count`;

const comparisonColumns = `
  c.id, c.base_version_id, c.target_version_id,
  c.comparison_schema_version, c.parser_version, c.engine_version,
  c.status, c.attempts, c.max_attempts, c.available_at,
  c.failure_code, c.trace_id, c.result_sha256, c.stable_hash,
  c.byte_equal, c.semantic_equal, c.completeness,
  c.summary, c.warnings, c.changes, c.created_at, c.updated_at,
  bv.display_number as base_display_number, bv.note as base_note,
  bv.created_at as base_created_at,
  ba.sha256 as base_artifact_sha256,
  bu.display_name as base_author_name,
  tv.display_number as target_display_number, tv.note as target_note,
  tv.created_at as target_created_at,
  ta.sha256 as target_artifact_sha256,
  tu.display_name as target_author_name`;

const mergeColumns = `
  m.id, m.branch_id, m.base_version_id, m.ours_version_id,
  m.theirs_version_id, m.note, m.merge_schema_version, m.parser_version,
  m.engine_version, m.status, m.attempts, m.max_attempts, m.available_at,
  m.failure_code, m.trace_id, m.strategy, m.stable_hash, m.warnings, m.analysis,
  m.applied_paths, m.candidate_object_key, m.candidate_sha256,
  m.candidate_byte_size, m.result_version_id, m.created_at, m.updated_at,
  bv.display_number as base_display_number, bv.note as base_note,
  bv.created_at as base_created_at, bv.status as base_status,
  ba.sha256 as base_artifact_sha256, bu.display_name as base_author_name,
  ov.display_number as ours_display_number, ov.note as ours_note,
  ov.created_at as ours_created_at, ov.status as ours_status,
  oa.sha256 as ours_artifact_sha256, ou.display_name as ours_author_name,
  tv.display_number as theirs_display_number, tv.note as theirs_note,
  tv.created_at as theirs_created_at, tv.status as theirs_status,
  ta.sha256 as theirs_artifact_sha256, tu.display_name as theirs_author_name`;

export class PostgresVersionStore implements VersionStore {
  public constructor(
    private readonly pool: Pool,
    private readonly organizationQuotaBytes: number,
  ) {}

  private async requireAccess(
    client: PoolClient,
    actor: VersionActor,
    projectId: string,
    documentId: string,
    write: boolean,
  ): Promise<AccessRow> {
    const result = await client.query<AccessRow>(
      `select d.kind as document_kind, d.archived_at as document_archived_at,
              p.archived_at as project_archived_at, pm.role as project_role,
              b.id as branch_id, b.name as branch_name,
              b.head_version_id as branch_head_version_id
         from documents d
         join projects p on p.id = d.project_id
          and p.organization_id = d.organization_id
         join document_branches b on b.document_id = d.id
          and b.organization_id = d.organization_id and b.is_default = true
         left join memberships m on m.organization_id = d.organization_id
          and m.user_id = $4 and m.status = 'active'
         left join project_memberships pm on pm.project_id = p.id
          and pm.organization_id = p.organization_id
          and pm.organization_membership_id = m.id and pm.removed_at is null
        where d.organization_id = $1 and d.project_id = $2 and d.id = $3
          and d.deleted_at is null and p.deleted_at is null`,
      [actor.organizationId, projectId, documentId, actor.userId],
    );
    const row = result.rows[0];
    const role = effectiveProjectRole(
      actor.organizationRole,
      row?.project_role ?? null,
    );
    if (!row || !role) throw new VersionOperationError('not_found');
    if (
      write &&
      (!canWriteProjectContent(role) ||
        row.document_archived_at ||
        row.project_archived_at)
    ) {
      throw new VersionOperationError('denied');
    }
    return row;
  }

  private async versionRow(
    client: PoolClient,
    organizationId: string,
    documentId: string,
    versionId: string,
  ): Promise<VersionRow | null> {
    const result = await client.query<VersionRow>(
      `select ${versionColumns}
         from document_versions v
         join artifacts a on a.id = v.artifact_id
         join users u on u.id = v.author_user_id
         join version_processing_jobs j on j.version_id = v.id
          and j.job_type = 'semantic_ingestion'
         left join normalized_snapshots s on s.version_id = v.id
        where v.organization_id = $1 and v.document_id = $2 and v.id = $3`,
      [organizationId, documentId, versionId],
    );
    return result.rows[0] ?? null;
  }

  private async comparisonRow(
    client: PoolClient,
    organizationId: string,
    documentId: string,
    comparisonId: string,
  ): Promise<ComparisonRow | null> {
    const result = await client.query<ComparisonRow>(
      `select ${comparisonColumns}
         from version_comparisons c
         join document_versions bv on bv.id = c.base_version_id
         join artifacts ba on ba.id = bv.artifact_id
         join users bu on bu.id = bv.author_user_id
         join document_versions tv on tv.id = c.target_version_id
         join artifacts ta on ta.id = tv.artifact_id
         join users tu on tu.id = tv.author_user_id
        where c.organization_id = $1 and c.document_id = $2 and c.id = $3`,
      [organizationId, documentId, comparisonId],
    );
    return result.rows[0] ?? null;
  }

  private async mergeRow(
    client: PoolClient,
    organizationId: string,
    documentId: string,
    mergeId: string,
  ): Promise<MergeRow | null> {
    const result = await client.query<MergeRow>(
      `select ${mergeColumns}
         from merge_operations m
         join document_versions bv on bv.id = m.base_version_id
         join artifacts ba on ba.id = bv.artifact_id
         join users bu on bu.id = bv.author_user_id
         join document_versions ov on ov.id = m.ours_version_id
         join artifacts oa on oa.id = ov.artifact_id
         join users ou on ou.id = ov.author_user_id
         join document_versions tv on tv.id = m.theirs_version_id
         join artifacts ta on ta.id = tv.artifact_id
         join users tu on tu.id = tv.author_user_id
        where m.organization_id = $1 and m.document_id = $2 and m.id = $3`,
      [organizationId, documentId, mergeId],
    );
    return result.rows[0] ?? null;
  }

  private async requireUpload(
    client: PoolClient,
    organizationId: string,
    documentId: string,
    uploadId: string,
    lock = false,
  ): Promise<UploadRow> {
    const result = await client.query<UploadRow>(
      `select ${uploadColumns} from staged_uploads
        where organization_id = $1 and document_id = $2 and id = $3
        ${lock ? 'for update' : ''}`,
      [organizationId, documentId, uploadId],
    );
    const row = result.rows[0];
    if (!row) throw new VersionOperationError('not_found');
    return row;
  }

  private async lockIdempotency(
    client: PoolClient,
    actor: VersionActor,
    operation: string,
    idempotencyKey: string,
  ): Promise<{
    keyHash: string;
    record: { request_hash: string; resource_id: string } | null;
  }> {
    const keyHash = hash(idempotencyKey);
    await client.query(
      'select pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${actor.userId}:${operation}:${keyHash}`],
    );
    const existing = await client.query<{
      request_hash: string;
      resource_id: string;
    }>(
      `select request_hash, response->>'resourceId' as resource_id
         from idempotency_records
        where actor_user_id = $1 and operation = $2 and key_hash = $3
          and expires_at > now()`,
      [actor.userId, operation, keyHash],
    );
    return { keyHash, record: existing.rows[0] ?? null };
  }

  private async saveIdempotency(
    client: PoolClient,
    input: {
      actor: VersionActor;
      keyHash: string;
      operation: string;
      requestHash: string;
      resourceId: string;
      response: Record<string, unknown>;
      statusCode: number;
    },
  ): Promise<void> {
    await client.query(
      `insert into idempotency_records
        (organization_id, actor_user_id, operation, key_hash, request_hash,
         response, status_code, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, now() + interval '24 hours')`,
      [
        input.actor.organizationId,
        input.actor.userId,
        input.operation,
        input.keyHash,
        input.requestHash,
        JSON.stringify({ ...input.response, resourceId: input.resourceId }),
        input.statusCode,
      ],
    );
  }

  private async insertAudit(
    client: PoolClient,
    input: {
      action: string;
      actor: VersionActor;
      metadata?: Record<string, string | number | boolean | null>;
      requestId: string;
      targetId: string;
      targetType: string;
    },
  ): Promise<void> {
    await client.query(
      `insert into audit_events
        (organization_id, actor_user_id, action, target_type, target_id,
         result, request_id, metadata)
       values ($1, $2, $3, $4, $5, 'succeeded', $6, $7)`,
      [
        input.actor.organizationId,
        input.actor.userId,
        input.action,
        input.targetType,
        input.targetId,
        input.requestId,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  private async insertProcessingEvents(
    client: PoolClient,
    organizationId: string,
    versionId: string,
  ): Promise<void> {
    await client.query(
      `insert into version_processing_jobs
        (organization_id, version_id, job_type)
       values ($1, $2, 'semantic_ingestion')`,
      [organizationId, versionId],
    );
    await client.query(
      `insert into outbox_events
        (organization_id, aggregate_type, aggregate_id, event_type, payload)
       values ($1, 'document_version', $2, 'version.processing_requested', $3)`,
      [organizationId, versionId, JSON.stringify({ versionId })],
    );
  }

  public async getDocumentAccess(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    write: boolean;
  }): Promise<DocumentAccess> {
    const client = await this.pool.connect();
    try {
      const row = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        input.write,
      );
      return { branch: mapBranch(row), documentKind: row.document_kind };
    } finally {
      client.release();
    }
  }

  public async createComparison(input: {
    actor: VersionActor;
    baseVersionId: string;
    comparisonSchemaVersion: string;
    documentId: string;
    engineVersion: string;
    idempotencyKey: string;
    parserVersion: string;
    projectId: string;
    requestHash: string;
    requestId: string;
    targetVersionId: string;
  }): Promise<{ comparison: VersionComparison; replayed: boolean }> {
    return inTransaction(this.pool, async (client) => {
      await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        false,
      );
      if (input.baseVersionId === input.targetVersionId) {
        throw new VersionOperationError('comparison_unavailable');
      }

      const operation = `comparison.create:${input.documentId}`;
      const idempotency = await this.lockIdempotency(
        client,
        input.actor,
        operation,
        input.idempotencyKey,
      );
      if (idempotency.record) {
        if (idempotency.record.request_hash !== input.requestHash) {
          throw new VersionOperationError('idempotency_conflict');
        }
        const replay = await this.comparisonRow(
          client,
          input.actor.organizationId,
          input.documentId,
          idempotency.record.resource_id,
        );
        if (!replay) throw new VersionOperationError('not_found');
        return { comparison: mapComparison(replay), replayed: true };
      }

      const versions = await client.query<{ id: string }>(
        `select v.id
           from document_versions v
           join artifacts a on a.id = v.artifact_id
           join version_processing_jobs j on j.version_id = v.id
            and j.job_type = 'semantic_ingestion'
          where v.organization_id = $1 and v.document_id = $2
            and v.id in ($3, $4)
            and v.status in ('ready', 'conflicted')
            and a.scan_status = 'clean' and j.status = 'completed'`,
        [
          input.actor.organizationId,
          input.documentId,
          input.baseVersionId,
          input.targetVersionId,
        ],
      );
      if (new Set(versions.rows.map((row) => row.id)).size !== 2) {
        throw new VersionOperationError('comparison_unavailable');
      }

      const inserted = await client.query<{ id: string }>(
        `insert into version_comparisons
          (organization_id, document_id, base_version_id, target_version_id,
           requested_by_user_id, comparison_schema_version, parser_version,
           engine_version)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (base_version_id, target_version_id,
                      comparison_schema_version, parser_version)
         do nothing
         returning id`,
        [
          input.actor.organizationId,
          input.documentId,
          input.baseVersionId,
          input.targetVersionId,
          input.actor.userId,
          input.comparisonSchemaVersion,
          input.parserVersion,
          input.engineVersion,
        ],
      );
      const comparisonId =
        inserted.rows[0]?.id ??
        (
          await client.query<{ id: string }>(
            `select id from version_comparisons
              where base_version_id = $1 and target_version_id = $2
                and comparison_schema_version = $3 and parser_version = $4`,
            [
              input.baseVersionId,
              input.targetVersionId,
              input.comparisonSchemaVersion,
              input.parserVersion,
            ],
          )
        ).rows[0]?.id;
      if (!comparisonId) {
        throw new Error('Comparison could not be created or loaded.');
      }

      if (inserted.rows[0]) {
        await client.query(
          `insert into outbox_events
            (organization_id, aggregate_type, aggregate_id, event_type, payload)
           values ($1, 'version_comparison', $2,
                   'version.comparison_requested', $3)`,
          [
            input.actor.organizationId,
            comparisonId,
            JSON.stringify({ comparisonId }),
          ],
        );
      }
      await this.saveIdempotency(client, {
        actor: input.actor,
        keyHash: idempotency.keyHash,
        operation,
        requestHash: input.requestHash,
        resourceId: comparisonId,
        response: { comparisonId },
        statusCode: inserted.rows[0] ? 201 : 200,
      });
      await this.insertAudit(client, {
        action: 'comparison.requested',
        actor: input.actor,
        metadata: {
          baseVersionId: input.baseVersionId,
          replayed: !inserted.rows[0],
          targetVersionId: input.targetVersionId,
        },
        requestId: input.requestId,
        targetId: comparisonId,
        targetType: 'version_comparison',
      });
      const row = await this.comparisonRow(
        client,
        input.actor.organizationId,
        input.documentId,
        comparisonId,
      );
      if (!row) throw new Error('Created comparison could not be loaded.');
      return { comparison: mapComparison(row), replayed: !inserted.rows[0] };
    });
  }

  public async getComparison(input: {
    actor: VersionActor;
    comparisonId: string;
    documentId: string;
    projectId: string;
  }): Promise<VersionComparison> {
    const client = await this.pool.connect();
    try {
      await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        false,
      );
      const row = await this.comparisonRow(
        client,
        input.actor.organizationId,
        input.documentId,
        input.comparisonId,
      );
      if (!row) throw new VersionOperationError('not_found');
      return mapComparison(row);
    } finally {
      client.release();
    }
  }

  public async createMerge(input: {
    actor: VersionActor;
    baseVersionId: string;
    documentId: string;
    engineVersion: string;
    idempotencyKey: string;
    mergeSchemaVersion: string;
    note: string;
    oursVersionId: string;
    parserVersion: string;
    projectId: string;
    requestHash: string;
    requestId: string;
    theirsVersionId: string;
  }): Promise<{ merge: DocumentMerge; replayed: boolean }> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        true,
      );
      if (
        new Set([
          input.baseVersionId,
          input.oursVersionId,
          input.theirsVersionId,
        ]).size !== 3 ||
        access.branch_head_version_id !== input.oursVersionId
      ) {
        throw new VersionOperationError('merge_unavailable');
      }

      const operation = `merge.create:${input.documentId}`;
      const idempotency = await this.lockIdempotency(
        client,
        input.actor,
        operation,
        input.idempotencyKey,
      );
      if (idempotency.record) {
        if (idempotency.record.request_hash !== input.requestHash) {
          throw new VersionOperationError('idempotency_conflict');
        }
        const replay = await this.mergeRow(
          client,
          input.actor.organizationId,
          input.documentId,
          idempotency.record.resource_id,
        );
        if (!replay) throw new VersionOperationError('not_found');
        return { merge: mapMerge(replay), replayed: true };
      }

      const versions = await client.query<{
        id: string;
        status: VersionStatus;
      }>(
        `select v.id, v.status
           from document_versions v
           join artifacts a on a.id = v.artifact_id
           join version_processing_jobs j on j.version_id = v.id
            and j.job_type = 'semantic_ingestion'
          where v.organization_id = $1 and v.document_id = $2
            and v.branch_id = $3 and v.id in ($4, $5, $6)
            and v.status in ('ready', 'conflicted')
            and a.scan_status = 'clean' and j.status = 'completed'`,
        [
          input.actor.organizationId,
          input.documentId,
          access.branch_id,
          input.baseVersionId,
          input.oursVersionId,
          input.theirsVersionId,
        ],
      );
      const statuses = new Map(
        versions.rows.map((version) => [version.id, version.status]),
      );
      if (
        statuses.size !== 3 ||
        statuses.get(input.baseVersionId) !== 'ready' ||
        statuses.get(input.oursVersionId) !== 'ready'
      ) {
        throw new VersionOperationError('merge_unavailable');
      }

      const ancestry = await client.query<{
        ours_has_base: boolean;
        theirs_has_base: boolean;
      }>(
        `with recursive ancestry(root, id) as (
           values ('ours', $4::uuid), ('theirs', $5::uuid)
           union
           select ancestry.root, parent.id
             from ancestry
             join document_versions v on v.id = ancestry.id
              and v.organization_id = $1 and v.document_id = $2
             cross join lateral (
               values (v.parent_version_id), (v.merge_parent_version_id)
             ) parent(id)
            where parent.id is not null
         )
         select coalesce(bool_or(root = 'ours' and id = $3), false) as ours_has_base,
                coalesce(bool_or(root = 'theirs' and id = $3), false) as theirs_has_base
           from ancestry`,
        [
          input.actor.organizationId,
          input.documentId,
          input.baseVersionId,
          input.oursVersionId,
          input.theirsVersionId,
        ],
      );
      if (
        !ancestry.rows[0]?.ours_has_base ||
        !ancestry.rows[0].theirs_has_base
      ) {
        throw new VersionOperationError('merge_unavailable');
      }

      const inserted = await client.query<{ id: string }>(
        `insert into merge_operations
          (organization_id, document_id, branch_id, base_version_id,
           ours_version_id, theirs_version_id, requested_by_user_id, note,
           merge_schema_version, parser_version, engine_version)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (base_version_id, ours_version_id, theirs_version_id,
                      merge_schema_version, parser_version)
         do nothing
         returning id`,
        [
          input.actor.organizationId,
          input.documentId,
          access.branch_id,
          input.baseVersionId,
          input.oursVersionId,
          input.theirsVersionId,
          input.actor.userId,
          input.note,
          input.mergeSchemaVersion,
          input.parserVersion,
          input.engineVersion,
        ],
      );
      const mergeId =
        inserted.rows[0]?.id ??
        (
          await client.query<{ id: string }>(
            `select id from merge_operations
              where base_version_id = $1 and ours_version_id = $2
                and theirs_version_id = $3 and merge_schema_version = $4
                and parser_version = $5`,
            [
              input.baseVersionId,
              input.oursVersionId,
              input.theirsVersionId,
              input.mergeSchemaVersion,
              input.parserVersion,
            ],
          )
        ).rows[0]?.id;
      if (!mergeId) throw new Error('Merge could not be created or loaded.');

      if (inserted.rows[0]) {
        await client.query(
          `insert into outbox_events
            (organization_id, aggregate_type, aggregate_id, event_type, payload)
           values ($1, 'merge_operation', $2, 'version.merge_requested', $3)`,
          [input.actor.organizationId, mergeId, JSON.stringify({ mergeId })],
        );
      }
      await this.saveIdempotency(client, {
        actor: input.actor,
        keyHash: idempotency.keyHash,
        operation,
        requestHash: input.requestHash,
        resourceId: mergeId,
        response: { mergeId },
        statusCode: inserted.rows[0] ? 201 : 200,
      });
      await this.insertAudit(client, {
        action: 'merge.requested',
        actor: input.actor,
        metadata: {
          baseVersionId: input.baseVersionId,
          oursVersionId: input.oursVersionId,
          replayed: !inserted.rows[0],
          theirsVersionId: input.theirsVersionId,
        },
        requestId: input.requestId,
        targetId: mergeId,
        targetType: 'merge_operation',
      });
      const row = await this.mergeRow(
        client,
        input.actor.organizationId,
        input.documentId,
        mergeId,
      );
      if (!row) throw new Error('Created merge could not be loaded.');
      return { merge: mapMerge(row), replayed: !inserted.rows[0] };
    });
  }

  public async getMerge(input: {
    actor: VersionActor;
    documentId: string;
    mergeId: string;
    projectId: string;
  }): Promise<DocumentMerge> {
    const client = await this.pool.connect();
    try {
      await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        false,
      );
      const row = await this.mergeRow(
        client,
        input.actor.organizationId,
        input.documentId,
        input.mergeId,
      );
      if (!row) throw new VersionOperationError('not_found');
      return mapMerge(row);
    } finally {
      client.release();
    }
  }

  public async getMergeCandidate(input: {
    actor: VersionActor;
    documentId: string;
    mergeId: string;
    projectId: string;
  }): Promise<AuthorizedMergeCandidate> {
    const client = await this.pool.connect();
    try {
      await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        false,
      );
      const result = await client.query<{
        byte_size: string | number;
        extension: string;
        object_key: string;
        sha256: string;
      }>(
        `select m.candidate_byte_size as byte_size,
                m.candidate_object_key as object_key,
                m.candidate_sha256 as sha256, a.extension
           from merge_operations m
           join document_versions v on v.id = m.ours_version_id
           join artifacts a on a.id = v.artifact_id
          where m.organization_id = $1 and m.document_id = $2 and m.id = $3
            and m.candidate_object_key is not null`,
        [input.actor.organizationId, input.documentId, input.mergeId],
      );
      const row = result.rows[0];
      if (!row) throw new VersionOperationError('not_found');
      return {
        byteSize: Number(row.byte_size),
        extension: row.extension,
        objectKey: row.object_key,
        sha256: row.sha256,
      };
    } finally {
      client.release();
    }
  }

  public async createUpload(input: {
    actor: VersionActor;
    baseVersionId: string | null;
    clientMediaType: string | null;
    documentId: string;
    expectedByteSize: number;
    expectedSha256: string;
    expiresAt: Date;
    extension: string;
    idempotencyKey: string;
    mode: UploadMode;
    multipartUploadId: string | null;
    originalFilename: string;
    partSize: number | null;
    projectId: string;
    requestHash: string;
    requestId: string;
    stagingObjectKey: string;
    uploadId: string;
  }): Promise<CreatedUploadRecord> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        true,
      );
      const operation = `upload.intent:${input.documentId}`;
      const idempotency = await this.lockIdempotency(
        client,
        input.actor,
        operation,
        input.idempotencyKey,
      );
      if (idempotency.record) {
        if (idempotency.record.request_hash !== input.requestHash) {
          throw new VersionOperationError('idempotency_conflict');
        }
        return {
          branch: mapBranch(access),
          record: mapUpload(
            await this.requireUpload(
              client,
              input.actor.organizationId,
              input.documentId,
              idempotency.record.resource_id,
            ),
          ),
          replayed: true,
        };
      }

      if (input.baseVersionId) {
        const base = await client.query(
          `select 1 from document_versions
            where organization_id = $1 and document_id = $2 and branch_id = $3
              and id = $4`,
          [
            input.actor.organizationId,
            input.documentId,
            access.branch_id,
            input.baseVersionId,
          ],
        );
        if (!base.rowCount) throw new VersionOperationError('invalid_base');
      } else if (access.branch_head_version_id) {
        throw new VersionOperationError('invalid_base');
      }

      await client.query(
        'select 1 from organizations where id = $1 for update',
        [input.actor.organizationId],
      );
      const usage = await client.query<{ used: string }>(
        `select (
            coalesce((select sum(byte_size) from artifacts
              where organization_id = $1), 0)
            + coalesce((select sum(expected_byte_size) from staged_uploads
              where organization_id = $1 and status = 'pending'
                and expires_at > now()), 0)
          )::text as used`,
        [input.actor.organizationId],
      );
      if (
        Number(usage.rows[0]?.used ?? 0) + input.expectedByteSize >
        this.organizationQuotaBytes
      ) {
        throw new VersionOperationError('quota_exceeded');
      }

      const inserted = await client.query<UploadRow>(
        `insert into staged_uploads
          (id, organization_id, document_id, branch_id, base_version_id,
           staging_object_key, expected_sha256, expected_byte_size,
           client_media_type, original_filename, extension, mode,
           multipart_upload_id, part_size, created_by_user_id, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 $13, $14, $15, $16)
         returning ${uploadColumns}`,
        [
          input.uploadId,
          input.actor.organizationId,
          input.documentId,
          access.branch_id,
          input.baseVersionId,
          input.stagingObjectKey,
          input.expectedSha256,
          input.expectedByteSize,
          input.clientMediaType,
          input.originalFilename,
          input.extension,
          input.mode,
          input.multipartUploadId,
          input.partSize,
          input.actor.userId,
          input.expiresAt,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error('Upload intent creation failed.');
      await this.saveIdempotency(client, {
        actor: input.actor,
        keyHash: idempotency.keyHash,
        operation,
        requestHash: input.requestHash,
        resourceId: row.id,
        response: {},
        statusCode: 201,
      });
      await this.insertAudit(client, {
        action: 'upload.intent_created',
        actor: input.actor,
        metadata: { byteSize: input.expectedByteSize, mode: input.mode },
        requestId: input.requestId,
        targetId: row.id,
        targetType: 'staged_upload',
      });
      return {
        branch: mapBranch(access),
        record: mapUpload(row),
        replayed: false,
      };
    });
  }

  public async getUpload(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    uploadId: string;
    write: boolean;
  }): Promise<StagedUploadRecord> {
    const client = await this.pool.connect();
    try {
      await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        input.write,
      );
      return mapUpload(
        await this.requireUpload(
          client,
          input.actor.organizationId,
          input.documentId,
          input.uploadId,
        ),
      );
    } finally {
      client.release();
    }
  }

  public async cancelUpload(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    requestId: string;
    uploadId: string;
  }): Promise<StagedUploadRecord> {
    return inTransaction(this.pool, async (client) => {
      await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        true,
      );
      const current = await this.requireUpload(
        client,
        input.actor.organizationId,
        input.documentId,
        input.uploadId,
        true,
      );
      if (current.status === 'finalized') {
        throw new VersionOperationError('invalid_state');
      }
      const updated = await client.query<UploadRow>(
        `update staged_uploads set status = 'cancelled', updated_at = now()
          where id = $1 and status = 'pending' returning ${uploadColumns}`,
        [input.uploadId],
      );
      const row = updated.rows[0] ?? current;
      await this.insertAudit(client, {
        action: 'upload.cancelled',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.uploadId,
        targetType: 'staged_upload',
      });
      return mapUpload(row);
    });
  }

  public async failUpload(
    uploadId: string,
    failureCode: string,
  ): Promise<void> {
    await this.pool.query(
      `update staged_uploads
          set status = 'failed', failure_code = $2, updated_at = now()
        where id = $1 and status = 'pending'`,
      [uploadId, failureCode],
    );
  }

  public async finalizeUpload(input: {
    actor: VersionActor;
    artifact: FinalizedArtifactInput;
    documentId: string;
    idempotencyKey: string;
    note: string;
    projectId: string;
    requestHash: string;
    requestId: string;
    source: VersionSource;
    uploadId: string;
  }): Promise<FinalizeVersionResult> {
    return inTransaction(this.pool, async (client) => {
      await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        true,
      );
      const operation = `upload.finalize:${input.uploadId}`;
      const idempotency = await this.lockIdempotency(
        client,
        input.actor,
        operation,
        input.idempotencyKey,
      );
      if (idempotency.record) {
        if (idempotency.record.request_hash !== input.requestHash) {
          throw new VersionOperationError('idempotency_conflict');
        }
        const version = await this.versionRow(
          client,
          input.actor.organizationId,
          input.documentId,
          idempotency.record.resource_id,
        );
        if (!version) throw new VersionOperationError('not_found');
        const head = await client.query<{ head_version_id: string | null }>(
          'select head_version_id from document_branches where id = $1',
          [version.branch_id],
        );
        return {
          currentHeadVersionId: head.rows[0]?.head_version_id ?? null,
          outcome: version.status === 'conflicted' ? 'conflict' : 'created',
          replayed: true,
          version: mapVersion(version),
        };
      }

      const upload = await this.requireUpload(
        client,
        input.actor.organizationId,
        input.documentId,
        input.uploadId,
        true,
      );
      if (upload.status === 'finalized' && upload.finalized_version_id) {
        const version = await this.versionRow(
          client,
          input.actor.organizationId,
          input.documentId,
          upload.finalized_version_id,
        );
        if (!version) throw new VersionOperationError('not_found');
        const head = await client.query<{ head_version_id: string | null }>(
          'select head_version_id from document_branches where id = $1',
          [upload.branch_id],
        );
        const outcome =
          version.status === 'conflicted' ? 'conflict' : 'created';
        await this.saveIdempotency(client, {
          actor: input.actor,
          keyHash: idempotency.keyHash,
          operation,
          requestHash: input.requestHash,
          resourceId: version.id,
          response: { outcome },
          statusCode: outcome === 'conflict' ? 409 : 200,
        });
        return {
          currentHeadVersionId: head.rows[0]?.head_version_id ?? null,
          outcome,
          replayed: true,
          version: mapVersion(version),
        };
      }
      if (upload.status !== 'pending') {
        throw new VersionOperationError('invalid_state');
      }
      if (upload.expires_at <= new Date()) {
        throw new VersionOperationError('upload_expired');
      }
      if (
        Number(upload.expected_byte_size) !== input.artifact.byteSize ||
        upload.expected_sha256 !== input.artifact.sha256 ||
        upload.extension !== input.artifact.extension ||
        upload.original_filename !== input.artifact.originalFilename
      ) {
        throw new VersionOperationError('invalid_state');
      }

      const branchResult = await client.query<{
        head_version_id: string | null;
      }>(
        `select head_version_id from document_branches
          where id = $1 and organization_id = $2 and document_id = $3
          for update`,
        [upload.branch_id, input.actor.organizationId, input.documentId],
      );
      const branch = branchResult.rows[0];
      if (!branch) throw new VersionOperationError('not_found');
      const currentHeadVersionId = branch.head_version_id;
      const stale = currentHeadVersionId !== upload.base_version_id;
      const parentVersionId =
        upload.base_version_id ?? (stale ? currentHeadVersionId : null);
      const sequenceResult = await client.query<{ sequence: number }>(
        `select coalesce(max(sequence), 0)::int + 1 as sequence
           from document_versions where branch_id = $1`,
        [upload.branch_id],
      );
      const sequence = sequenceResult.rows[0]?.sequence;
      if (!sequence) throw new Error('Could not allocate version sequence.');

      const artifactResult = await client.query<{ id: string }>(
        `insert into artifacts
          (organization_id, object_key, sha256, byte_size, detected_media_type,
           original_filename, extension, storage_version, storage_checksum,
           created_by_user_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id`,
        [
          input.actor.organizationId,
          input.artifact.objectKey,
          input.artifact.sha256,
          input.artifact.byteSize,
          input.artifact.detectedMediaType,
          input.artifact.originalFilename,
          input.artifact.extension,
          input.artifact.storageVersion,
          input.artifact.storageChecksum,
          input.actor.userId,
        ],
      );
      const artifactId = artifactResult.rows[0]?.id;
      if (!artifactId) throw new Error('Artifact creation failed.');
      const status: VersionStatus = stale ? 'conflicted' : 'pending_processing';
      const versionResult = await client.query<{ id: string }>(
        `insert into document_versions
          (organization_id, document_id, branch_id, artifact_id, sequence,
           display_number, parent_version_id, base_version_id, source, status,
           note, conflict_reason, author_user_id)
         values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12)
         returning id`,
        [
          input.actor.organizationId,
          input.documentId,
          upload.branch_id,
          artifactId,
          sequence,
          parentVersionId,
          upload.base_version_id,
          input.source,
          status,
          input.note,
          stale ? 'base_version_is_not_current_head' : null,
          input.actor.userId,
        ],
      );
      const versionId = versionResult.rows[0]?.id;
      if (!versionId) throw new Error('Version creation failed.');

      if (!stale) {
        const advanced = await client.query(
          `update document_branches
              set head_version_id = $2, updated_at = now()
            where id = $1 and head_version_id is not distinct from $3::uuid`,
          [upload.branch_id, versionId, upload.base_version_id],
        );
        if (advanced.rowCount !== 1) {
          throw new Error('Branch head compare-and-swap failed under lock.');
        }
      }
      await client.query(
        `update staged_uploads
            set status = 'finalized', finalized_version_id = $2,
                finalized_at = now(), updated_at = now()
          where id = $1`,
        [upload.id, versionId],
      );
      await this.insertProcessingEvents(
        client,
        input.actor.organizationId,
        versionId,
      );
      await this.insertAudit(client, {
        action: stale ? 'version.push_conflicted' : 'version.pushed',
        actor: input.actor,
        metadata: {
          baseVersionId: upload.base_version_id,
          currentHeadVersionId,
          sha256: input.artifact.sha256,
        },
        requestId: input.requestId,
        targetId: versionId,
        targetType: 'document_version',
      });
      const outcome = stale ? 'conflict' : 'created';
      await this.saveIdempotency(client, {
        actor: input.actor,
        keyHash: idempotency.keyHash,
        operation,
        requestHash: input.requestHash,
        resourceId: versionId,
        response: { outcome },
        statusCode: stale ? 409 : 201,
      });
      const version = await this.versionRow(
        client,
        input.actor.organizationId,
        input.documentId,
        versionId,
      );
      if (!version) throw new Error('Created version could not be loaded.');
      return {
        currentHeadVersionId: stale ? currentHeadVersionId : versionId,
        outcome,
        replayed: false,
        version: mapVersion(version),
      };
    });
  }

  public async getVersion(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    versionId: string;
  }): Promise<AuthorizedArtifact> {
    const client = await this.pool.connect();
    try {
      await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        false,
      );
      const row = await this.versionRow(
        client,
        input.actor.organizationId,
        input.documentId,
        input.versionId,
      );
      if (!row) throw new VersionOperationError('not_found');
      return { objectKey: row.artifact_object_key, version: mapVersion(row) };
    } finally {
      client.release();
    }
  }

  public async listVersions(input: {
    actor: VersionActor;
    documentId: string;
    page: PageInput;
    projectId: string;
  }): Promise<VersionPage> {
    const client = await this.pool.connect();
    try {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        false,
      );
      const cursor = input.page.cursor
        ? decodeVersionCursor(input.page.cursor)
        : null;
      const result = await client.query<VersionRow>(
        `select ${versionColumns}
           from document_versions v
           join artifacts a on a.id = v.artifact_id
           join users u on u.id = v.author_user_id
           join version_processing_jobs j on j.version_id = v.id
            and j.job_type = 'semantic_ingestion'
           left join normalized_snapshots s on s.version_id = v.id
          where v.organization_id = $1 and v.document_id = $2
            and v.branch_id = $3
            and ($4::int is null or (v.sequence, v.id) < ($4::int, $5::uuid))
          order by v.sequence desc, v.id desc limit $6`,
        [
          input.actor.organizationId,
          input.documentId,
          access.branch_id,
          cursor?.sequence ?? null,
          cursor?.id ?? null,
          input.page.limit + 1,
        ],
      );
      const rows = result.rows.slice(0, input.page.limit);
      const last = rows.at(-1);
      return {
        branch: mapBranch(access),
        items: rows.map(mapVersion),
        nextCursor:
          result.rows.length > input.page.limit && last
            ? encodeVersionCursor(last)
            : null,
      };
    } finally {
      client.release();
    }
  }

  public async restoreVersion(input: {
    actor: VersionActor;
    documentId: string;
    expectedHeadVersionId: string;
    idempotencyKey: string;
    note: string;
    projectId: string;
    requestHash: string;
    requestId: string;
    versionId: string;
  }): Promise<{ replayed: boolean; version: DocumentVersionSummary }> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
        true,
      );
      const operation = `version.restore:${input.documentId}`;
      const idempotency = await this.lockIdempotency(
        client,
        input.actor,
        operation,
        input.idempotencyKey,
      );
      if (idempotency.record) {
        if (idempotency.record.request_hash !== input.requestHash) {
          throw new VersionOperationError('idempotency_conflict');
        }
        const replay = await this.versionRow(
          client,
          input.actor.organizationId,
          input.documentId,
          idempotency.record.resource_id,
        );
        if (!replay) throw new VersionOperationError('not_found');
        return { replayed: true, version: mapVersion(replay) };
      }

      const branchResult = await client.query<{
        head_version_id: string | null;
      }>(
        `select head_version_id from document_branches where id = $1 for update`,
        [access.branch_id],
      );
      const head = branchResult.rows[0]?.head_version_id ?? null;
      if (head !== input.expectedHeadVersionId) {
        throw new VersionOperationError('stale_head');
      }
      const source = await client.query<{ artifact_id: string }>(
        `select artifact_id from document_versions
          where organization_id = $1 and document_id = $2 and branch_id = $3
            and id = $4`,
        [
          input.actor.organizationId,
          input.documentId,
          access.branch_id,
          input.versionId,
        ],
      );
      const artifactId = source.rows[0]?.artifact_id;
      if (!artifactId) throw new VersionOperationError('not_found');
      const sequenceResult = await client.query<{ sequence: number }>(
        `select coalesce(max(sequence), 0)::int + 1 as sequence
           from document_versions where branch_id = $1`,
        [access.branch_id],
      );
      const sequence = sequenceResult.rows[0]?.sequence;
      if (!sequence) throw new Error('Could not allocate restore sequence.');
      const inserted = await client.query<{ id: string }>(
        `insert into document_versions
          (organization_id, document_id, branch_id, artifact_id, sequence,
           display_number, parent_version_id, base_version_id, source, status,
           note, author_user_id)
         values ($1, $2, $3, $4, $5, $5, $6, $6, 'restore',
                 'pending_processing', $7, $8)
         returning id`,
        [
          input.actor.organizationId,
          input.documentId,
          access.branch_id,
          artifactId,
          sequence,
          head,
          input.note,
          input.actor.userId,
        ],
      );
      const versionId = inserted.rows[0]?.id;
      if (!versionId) throw new Error('Restore version creation failed.');
      const advanced = await client.query(
        `update document_branches
            set head_version_id = $2, updated_at = now()
          where id = $1 and head_version_id = $3`,
        [access.branch_id, versionId, input.expectedHeadVersionId],
      );
      if (advanced.rowCount !== 1) {
        throw new Error('Restore branch compare-and-swap failed under lock.');
      }
      await this.insertProcessingEvents(
        client,
        input.actor.organizationId,
        versionId,
      );
      await this.insertAudit(client, {
        action: 'version.restored',
        actor: input.actor,
        metadata: {
          restoredVersionId: input.versionId,
          previousHeadVersionId: head,
        },
        requestId: input.requestId,
        targetId: versionId,
        targetType: 'document_version',
      });
      await this.saveIdempotency(client, {
        actor: input.actor,
        keyHash: idempotency.keyHash,
        operation,
        requestHash: input.requestHash,
        resourceId: versionId,
        response: { restoredVersionId: input.versionId },
        statusCode: 201,
      });
      const version = await this.versionRow(
        client,
        input.actor.organizationId,
        input.documentId,
        versionId,
      );
      if (!version) throw new Error('Restored version could not be loaded.');
      return { replayed: false, version: mapVersion(version) };
    });
  }

  public async appendDownloadAudit(input: {
    actor: VersionActor;
    requestId: string;
    versionId: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.insertAudit(client, {
        action: 'version.download_granted',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.versionId,
        targetType: 'document_version',
      });
    } finally {
      client.release();
    }
  }

  public async appendMergeCandidateDownloadAudit(input: {
    actor: VersionActor;
    mergeId: string;
    requestId: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.insertAudit(client, {
        action: 'merge.candidate_download_granted',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.mergeId,
        targetType: 'merge_operation',
      });
    } finally {
      client.release();
    }
  }

  public async expireUploads(now: Date): Promise<ExpiredUpload[]> {
    const result = await this.pool.query<{
      id: string;
      mode: UploadMode;
      multipart_upload_id: string | null;
      staging_object_key: string;
    }>(
      `update staged_uploads set status = 'expired', updated_at = now()
        where status = 'pending' and expires_at <= $1
        returning id, mode, multipart_upload_id, staging_object_key`,
      [now],
    );
    return result.rows.map((row) => ({
      id: row.id,
      mode: row.mode,
      multipartUploadId: row.multipart_upload_id,
      stagingObjectKey: row.staging_object_key,
    }));
  }

  public async listReferencedObjectKeys(): Promise<Set<string>> {
    const result = await this.pool.query<{ object_key: string }>(
      `select object_key from artifacts
       union
       select staging_object_key as object_key from staged_uploads
        where status = 'pending'
       union
       select object_key from normalized_snapshots
       union
       select result_object_key as object_key from version_comparisons
        where result_object_key is not null
       union
       select candidate_object_key as object_key from merge_operations
        where candidate_object_key is not null`,
    );
    return new Set(result.rows.map((row) => row.object_key));
  }
}
