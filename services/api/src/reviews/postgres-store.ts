import type { Pool, PoolClient } from 'pg';

import {
  canWriteProjectContent,
  effectiveProjectRole,
} from '../projects/authorization';
import type { ProjectActor, ProjectRole } from '../projects/types';
import { hashToken } from '../security/crypto';
import { ReviewOperationError, type ReviewStore } from './store';
import type {
  ReviewAssignmentSummary,
  ReviewCommentSummary,
  ReviewDecisionValue,
  ReviewPage,
  ReviewRequestStatus,
  ReviewRequestSummary,
  ReviewThreadAnchor,
  ReviewThreadSummary,
} from './types';

interface AccessRow {
  document_archived_at: Date | null;
  project_archived_at: Date | null;
  project_role: ProjectRole | null;
}

interface ReviewRow {
  approved_display_number: number | null;
  approved_version_id: string | null;
  closed_at: Date | null;
  comparison_id: string | null;
  created_at: Date;
  id: string;
  message: string;
  requested_by_name: string;
  requested_by_user_id: string;
  status: ReviewRequestStatus;
  updated_at: Date;
  version_author_id: string;
  version_author_name: string;
  version_created_at: Date;
  version_display_number: number;
  version_id: string;
  version_note: string;
}

interface AssignmentRow {
  decision: ReviewDecisionValue | null;
  decision_created_at: Date | null;
  decision_id: string | null;
  decision_note: string | null;
  display_name: string;
  project_role: ProjectRole | null;
  reviewer_user_id: string;
}

interface ThreadRow {
  anchor_category: ReviewThreadAnchor['category'] | null;
  anchor_change_id: string | null;
  anchor_label: string | null;
  anchor_path: string | null;
  anchor_type: 'comparison_change' | 'general';
  comparison_id: string | null;
  created_at: Date;
  created_by_name: string;
  created_by_user_id: string;
  id: string;
  resolved_at: Date | null;
  resolved_by_name: string | null;
  resolved_by_user_id: string | null;
  status: 'open' | 'resolved';
  updated_at: Date;
}

interface CommentRow {
  author_name: string;
  author_user_id: string;
  body: string;
  created_at: Date;
  id: string;
  thread_id: string;
}

interface LockedReviewRow {
  approved_sequence: number | null;
  branch_id: string;
  comparison_id: string | null;
  requested_by_user_id: string;
  status: ReviewRequestStatus;
  version_author_id: string;
  version_id: string;
  version_sequence: number;
}

interface IdempotencyRecord {
  request_hash: string;
  resource_id: string;
}

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function canDecide(role: ProjectRole): boolean {
  return role === 'project_lead' || role === 'reviewer';
}

function canComment(role: ProjectRole): boolean {
  return role !== 'viewer';
}

function requestHash(value: object): string {
  return hashToken(JSON.stringify(value));
}

function encodeCursor(row: { created_at: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.created_at.toISOString(), id: row.id }),
  ).toString('base64url');
}

function decodeCursor(value: string): { createdAt: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('invalid');
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.valueOf()) || !idPattern.test(parsed.id)) {
      throw new Error('invalid');
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new ReviewOperationError('invalid_cursor');
  }
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
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      String(error.code) === '23505'
    ) {
      throw new ReviewOperationError('conflict');
    }
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresReviewStore implements ReviewStore {
  public constructor(private readonly pool: Pool) {}

  private async requireAccess(
    client: PoolClient,
    actor: ProjectActor,
    projectId: string,
    documentId: string,
  ): Promise<{ archived: boolean; role: ProjectRole }> {
    const result = await client.query<AccessRow>(
      `select p.archived_at as project_archived_at,
              d.archived_at as document_archived_at, pm.role as project_role
         from documents d
         join projects p on p.id = d.project_id
          and p.organization_id = d.organization_id
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
    if (!row || !role) throw new ReviewOperationError('not_found');
    return {
      archived: Boolean(row.document_archived_at || row.project_archived_at),
      role,
    };
  }

  private async claimIdempotency(
    client: PoolClient,
    input: {
      actor: ProjectActor;
      key: string;
      operation: string;
      payload: object;
    },
  ): Promise<{ keyHash: string; record: IdempotencyRecord | null }> {
    const keyHash = hashToken(input.key);
    const payloadHash = requestHash(input.payload);
    await client.query(
      `delete from idempotency_records
        where actor_user_id = $1 and operation = $2 and key_hash = $3
          and expires_at <= now()`,
      [input.actor.userId, input.operation, keyHash],
    );
    await client.query(
      `insert into idempotency_records
        (organization_id, actor_user_id, operation, key_hash, request_hash,
         expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '24 hours')
       on conflict (actor_user_id, operation, key_hash) do nothing`,
      [
        input.actor.organizationId,
        input.actor.userId,
        input.operation,
        keyHash,
        payloadHash,
      ],
    );
    const result = await client.query<IdempotencyRecord>(
      `select request_hash, response->>'resourceId' as resource_id
         from idempotency_records
        where actor_user_id = $1 and operation = $2 and key_hash = $3
        for update`,
      [input.actor.userId, input.operation, keyHash],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Idempotency record could not be locked.');
    if (row.request_hash !== payloadHash) {
      throw new ReviewOperationError('idempotency_conflict');
    }
    return { keyHash, record: row.resource_id ? row : null };
  }

  private async completeIdempotency(
    client: PoolClient,
    input: {
      actor: ProjectActor;
      keyHash: string;
      operation: string;
      reviewRequestId: string;
    },
  ): Promise<void> {
    await client.query(
      `update idempotency_records
          set status_code = 200, response = $4
        where actor_user_id = $1 and operation = $2 and key_hash = $3`,
      [
        input.actor.userId,
        input.operation,
        input.keyHash,
        JSON.stringify({ resourceId: input.reviewRequestId }),
      ],
    );
  }

  private async audit(
    client: PoolClient,
    input: {
      action: string;
      actor: ProjectActor;
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

  private async event(
    client: PoolClient,
    input: {
      eventType: string;
      organizationId: string;
      payload: Record<string, string | number | boolean | null>;
      reviewRequestId: string;
    },
  ): Promise<void> {
    await client.query(
      `insert into outbox_events
        (organization_id, aggregate_type, aggregate_id, event_type, payload)
       values ($1, 'review_request', $2, $3, $4)`,
      [
        input.organizationId,
        input.reviewRequestId,
        input.eventType,
        JSON.stringify(input.payload),
      ],
    );
  }

  private async reviewRow(
    client: PoolClient,
    organizationId: string,
    documentId: string,
    reviewRequestId: string,
  ): Promise<ReviewRow> {
    const result = await client.query<ReviewRow>(
      `select r.id, r.version_id, r.comparison_id, r.message, r.status,
              r.requested_by_user_id, requester.display_name as requested_by_name,
              r.closed_at, r.created_at, r.updated_at,
              v.display_number as version_display_number,
              v.note as version_note, v.created_at as version_created_at,
              v.author_user_id as version_author_id,
              author.display_name as version_author_name,
              b.approved_version_id,
              approved.display_number as approved_display_number
         from review_requests r
         join document_versions v on v.id = r.version_id
         join users requester on requester.id = r.requested_by_user_id
         join users author on author.id = v.author_user_id
         join document_branches b on b.id = v.branch_id
         left join document_versions approved on approved.id = b.approved_version_id
        where r.organization_id = $1 and r.document_id = $2 and r.id = $3`,
      [organizationId, documentId, reviewRequestId],
    );
    const row = result.rows[0];
    if (!row) throw new ReviewOperationError('not_found');
    return row;
  }

  private async loadReview(
    client: PoolClient,
    input: {
      actor: ProjectActor;
      accessRole: ProjectRole;
      documentId: string;
      projectId: string;
      reviewRequestId: string;
    },
  ): Promise<ReviewRequestSummary> {
    const row = await this.reviewRow(
      client,
      input.actor.organizationId,
      input.documentId,
      input.reviewRequestId,
    );
    const assignmentsResult = await client.query<AssignmentRow>(
      `select a.reviewer_user_id, reviewer.display_name,
              active_pm.role as project_role,
              decision.id as decision_id, decision.decision,
              decision.note as decision_note,
              decision.created_at as decision_created_at
         from review_assignments a
         join users reviewer on reviewer.id = a.reviewer_user_id
         left join memberships active_m on active_m.organization_id = a.organization_id
          and active_m.user_id = a.reviewer_user_id and active_m.status = 'active'
         left join project_memberships active_pm
          on active_pm.organization_id = a.organization_id
          and active_pm.project_id = $3
          and active_pm.organization_membership_id = active_m.id
          and active_pm.removed_at is null
         left join review_decisions decision
          on decision.review_request_id = a.review_request_id
          and decision.reviewer_user_id = a.reviewer_user_id
        where a.organization_id = $1 and a.review_request_id = $2
        order by lower(reviewer.display_name), a.reviewer_user_id`,
      [input.actor.organizationId, row.id, input.projectId],
    );
    const assignments: ReviewAssignmentSummary[] = assignmentsResult.rows.map(
      (assignment) => ({
        decision:
          assignment.decision_id &&
          assignment.decision &&
          assignment.decision_note !== null &&
          assignment.decision_created_at
            ? {
                createdAt: assignment.decision_created_at,
                decision: assignment.decision,
                id: assignment.decision_id,
                note: assignment.decision_note,
              }
            : null,
        projectRole: assignment.project_role,
        reviewer: {
          id: assignment.reviewer_user_id,
          name: assignment.display_name,
        },
      }),
    );
    const threadResult = await client.query<ThreadRow>(
      `select thread.id, thread.comparison_id, thread.anchor_type,
              thread.anchor_change_id, thread.anchor_path, thread.anchor_label,
              thread.anchor_category, thread.status,
              thread.created_by_user_id, creator.display_name as created_by_name,
              thread.resolved_at, thread.resolved_by_user_id,
              resolver.display_name as resolved_by_name,
              thread.created_at, thread.updated_at
         from review_threads thread
         join users creator on creator.id = thread.created_by_user_id
         left join users resolver on resolver.id = thread.resolved_by_user_id
        where thread.organization_id = $1 and thread.review_request_id = $2
        order by thread.created_at, thread.id`,
      [input.actor.organizationId, row.id],
    );
    const threadIds = threadResult.rows.map((thread) => thread.id);
    const commentsResult = threadIds.length
      ? await client.query<CommentRow>(
          `select comment.id, comment.thread_id, comment.body,
                  comment.author_user_id, author.display_name as author_name,
                  comment.created_at
             from review_comments comment
             join users author on author.id = comment.author_user_id
            where comment.organization_id = $1
              and comment.thread_id = any($2::uuid[])
            order by comment.created_at, comment.id`,
          [input.actor.organizationId, threadIds],
        )
      : { rows: [] as CommentRow[] };
    const comments = new Map<string, ReviewCommentSummary[]>();
    for (const comment of commentsResult.rows) {
      const item = {
        author: { id: comment.author_user_id, name: comment.author_name },
        body: comment.body,
        createdAt: comment.created_at,
        id: comment.id,
      };
      comments.set(comment.thread_id, [
        ...(comments.get(comment.thread_id) ?? []),
        item,
      ]);
    }
    const threads: ReviewThreadSummary[] = threadResult.rows.map((thread) => ({
      anchor:
        thread.anchor_type === 'comparison_change' &&
        thread.comparison_id &&
        thread.anchor_change_id &&
        thread.anchor_path &&
        thread.anchor_label &&
        thread.anchor_category
          ? {
              category: thread.anchor_category,
              changeId: thread.anchor_change_id,
              comparisonId: thread.comparison_id,
              label: thread.anchor_label,
              path: thread.anchor_path,
            }
          : null,
      canResolve:
        row.status === 'open' &&
        thread.status === 'open' &&
        (input.accessRole === 'project_lead' ||
          thread.created_by_user_id === input.actor.userId ||
          row.requested_by_user_id === input.actor.userId),
      comments: comments.get(thread.id) ?? [],
      createdAt: thread.created_at,
      createdBy: {
        id: thread.created_by_user_id,
        name: thread.created_by_name,
      },
      id: thread.id,
      resolvedAt: thread.resolved_at,
      resolvedBy:
        thread.resolved_by_user_id && thread.resolved_by_name
          ? {
              id: thread.resolved_by_user_id,
              name: thread.resolved_by_name,
            }
          : null,
      status: thread.status,
      updatedAt: thread.updated_at,
    }));
    const ownAssignment = assignments.find(
      (assignment) => assignment.reviewer.id === input.actor.userId,
    );
    return {
      approvedVersion:
        row.approved_version_id && row.approved_display_number
          ? {
              displayNumber: row.approved_display_number,
              id: row.approved_version_id,
            }
          : null,
      assignments,
      capabilities: {
        canCancel:
          row.status === 'open' &&
          (input.accessRole === 'project_lead' ||
            row.requested_by_user_id === input.actor.userId),
        canComment: row.status === 'open' && canComment(input.accessRole),
        canDecide:
          row.status === 'open' &&
          Boolean(
            ownAssignment?.projectRole &&
            !ownAssignment.decision &&
            canDecide(ownAssignment.projectRole),
          ) &&
          row.version_author_id !== input.actor.userId,
      },
      closedAt: row.closed_at,
      comparisonId: row.comparison_id,
      createdAt: row.created_at,
      id: row.id,
      message: row.message,
      requestedBy: {
        id: row.requested_by_user_id,
        name: row.requested_by_name,
      },
      status: row.status,
      threads,
      updatedAt: row.updated_at,
      version: {
        author: {
          id: row.version_author_id,
          name: row.version_author_name,
        },
        createdAt: row.version_created_at,
        displayNumber: row.version_display_number,
        id: row.version_id,
        note: row.version_note,
      },
    };
  }

  private async lockReview(
    client: PoolClient,
    organizationId: string,
    documentId: string,
    reviewRequestId: string,
  ): Promise<LockedReviewRow> {
    const result = await client.query<LockedReviewRow>(
      `select r.status, r.version_id, r.comparison_id,
              r.requested_by_user_id, v.author_user_id as version_author_id,
              v.sequence as version_sequence, v.branch_id,
              approved.sequence as approved_sequence
         from review_requests r
         join document_versions v on v.id = r.version_id
         join document_branches branch on branch.id = v.branch_id
         left join document_versions approved
          on approved.id = branch.approved_version_id
        where r.organization_id = $1 and r.document_id = $2 and r.id = $3
        for update of r, branch`,
      [organizationId, documentId, reviewRequestId],
    );
    const row = result.rows[0];
    if (!row) throw new ReviewOperationError('not_found');
    return row;
  }

  public async createReview(input: {
    actor: ProjectActor;
    comparisonId: string | null;
    documentId: string;
    idempotencyKey: string;
    message: string;
    projectId: string;
    requestId: string;
    reviewerUserIds: string[];
    versionId: string;
  }): Promise<{ replayed: boolean; review: ReviewRequestSummary }> {
    return transaction(this.pool, async (client) => {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
      );
      if (access.archived || !canWriteProjectContent(access.role)) {
        throw new ReviewOperationError('denied');
      }
      const reviewerUserIds = [...new Set(input.reviewerUserIds)].sort();
      const operation = `review.create:${input.documentId}`;
      const idempotency = await this.claimIdempotency(client, {
        actor: input.actor,
        key: input.idempotencyKey,
        operation,
        payload: {
          comparisonId: input.comparisonId,
          message: input.message,
          reviewerUserIds,
          versionId: input.versionId,
        },
      });
      if (idempotency.record) {
        return {
          replayed: true,
          review: await this.loadReview(client, {
            actor: input.actor,
            accessRole: access.role,
            documentId: input.documentId,
            projectId: input.projectId,
            reviewRequestId: idempotency.record.resource_id,
          }),
        };
      }
      const version = await client.query<{
        approved_sequence: number | null;
        author_user_id: string;
        sequence: number;
      }>(
        `select version.author_user_id, version.sequence,
                approved.sequence as approved_sequence
           from document_versions version
           join artifacts artifact on artifact.id = version.artifact_id
           join version_processing_jobs job on job.version_id = version.id
            and job.job_type = 'semantic_ingestion' and job.status = 'completed'
           join document_branches branch on branch.id = version.branch_id
           left join document_versions approved
            on approved.id = branch.approved_version_id
          where version.organization_id = $1 and version.document_id = $2
            and version.id = $3 and version.status = 'ready'
            and artifact.scan_status = 'clean'
          for share of version
          for update of branch`,
        [input.actor.organizationId, input.documentId, input.versionId],
      );
      const target = version.rows[0];
      if (
        !target ||
        (target.approved_sequence !== null &&
          target.sequence <= target.approved_sequence)
      ) {
        throw new ReviewOperationError('review_unavailable');
      }
      if (
        reviewerUserIds.length === 0 ||
        reviewerUserIds.length > 20 ||
        reviewerUserIds.includes(target.author_user_id)
      ) {
        throw new ReviewOperationError('invalid_reviewers');
      }
      const reviewers = await client.query<{ user_id: string }>(
        `select membership.user_id
           from project_memberships project_membership
           join memberships membership
            on membership.id = project_membership.organization_membership_id
            and membership.organization_id = project_membership.organization_id
            and membership.status = 'active'
          where project_membership.organization_id = $1
            and project_membership.project_id = $2
            and project_membership.removed_at is null
            and project_membership.role in ('project_lead', 'reviewer')
            and membership.user_id = any($3::uuid[])`,
        [input.actor.organizationId, input.projectId, reviewerUserIds],
      );
      if (
        new Set(reviewers.rows.map((row) => row.user_id)).size !==
        reviewerUserIds.length
      ) {
        throw new ReviewOperationError('invalid_reviewers');
      }
      if (input.comparisonId) {
        const comparison = await client.query(
          `select 1 from version_comparisons
            where organization_id = $1 and document_id = $2 and id = $3
              and target_version_id = $4 and status = 'completed'`,
          [
            input.actor.organizationId,
            input.documentId,
            input.comparisonId,
            input.versionId,
          ],
        );
        if (!comparison.rowCount) {
          throw new ReviewOperationError('review_unavailable');
        }
      }
      const existing = await client.query(
        `select 1 from review_requests
          where version_id = $1 and status = 'open'`,
        [input.versionId],
      );
      if (existing.rowCount) {
        throw new ReviewOperationError('review_unavailable');
      }
      const created = await client.query<{ id: string }>(
        `insert into review_requests
          (organization_id, document_id, version_id, comparison_id,
           requested_by_user_id, message)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [
          input.actor.organizationId,
          input.documentId,
          input.versionId,
          input.comparisonId,
          input.actor.userId,
          input.message,
        ],
      );
      const reviewRequestId = created.rows[0]?.id;
      if (!reviewRequestId) throw new Error('Review request was not created.');
      for (const reviewerUserId of reviewerUserIds) {
        await client.query(
          `insert into review_assignments
            (organization_id, review_request_id, reviewer_user_id,
             assigned_by_user_id)
           values ($1, $2, $3, $4)`,
          [
            input.actor.organizationId,
            reviewRequestId,
            reviewerUserId,
            input.actor.userId,
          ],
        );
      }
      await this.completeIdempotency(client, {
        actor: input.actor,
        keyHash: idempotency.keyHash,
        operation,
        reviewRequestId,
      });
      await this.audit(client, {
        action: 'review.requested',
        actor: input.actor,
        metadata: {
          reviewerCount: reviewerUserIds.length,
          versionId: input.versionId,
        },
        requestId: input.requestId,
        targetId: reviewRequestId,
        targetType: 'review_request',
      });
      await this.event(client, {
        eventType: 'review.requested',
        organizationId: input.actor.organizationId,
        payload: {
          actorUserId: input.actor.userId,
          reviewRequestId,
          versionId: input.versionId,
        },
        reviewRequestId,
      });
      return {
        replayed: false,
        review: await this.loadReview(client, {
          actor: input.actor,
          accessRole: access.role,
          documentId: input.documentId,
          projectId: input.projectId,
          reviewRequestId,
        }),
      };
    });
  }

  public async getReview(input: {
    actor: ProjectActor;
    documentId: string;
    projectId: string;
    reviewRequestId: string;
  }): Promise<ReviewRequestSummary> {
    const client = await this.pool.connect();
    try {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
      );
      return await this.loadReview(client, {
        ...input,
        accessRole: access.role,
      });
    } finally {
      client.release();
    }
  }

  public async listReviews(input: {
    actor: ProjectActor;
    cursor?: string | undefined;
    documentId: string;
    limit: number;
    projectId: string;
  }): Promise<ReviewPage> {
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const client = await this.pool.connect();
    try {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
      );
      const result = await client.query<{ created_at: Date; id: string }>(
        `select id, created_at from review_requests
          where organization_id = $1 and document_id = $2
            and ($3::timestamptz is null
              or (created_at, id) < ($3, $4::uuid))
          order by created_at desc, id desc
          limit $5`,
        [
          input.actor.organizationId,
          input.documentId,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          input.limit + 1,
        ],
      );
      const rows = result.rows.slice(0, input.limit);
      const items: ReviewRequestSummary[] = [];
      for (const row of rows) {
        items.push(
          await this.loadReview(client, {
            actor: input.actor,
            accessRole: access.role,
            documentId: input.documentId,
            projectId: input.projectId,
            reviewRequestId: row.id,
          }),
        );
      }
      const last = rows.at(-1);
      return {
        items,
        nextCursor:
          result.rows.length > input.limit && last ? encodeCursor(last) : null,
      };
    } finally {
      client.release();
    }
  }

  public async decide(input: {
    actor: ProjectActor;
    decision: ReviewDecisionValue;
    documentId: string;
    idempotencyKey: string;
    note: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
  }): Promise<ReviewRequestSummary> {
    return transaction(this.pool, async (client) => {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
      );
      const operation = `review.decide:${input.reviewRequestId}`;
      const idempotency = await this.claimIdempotency(client, {
        actor: input.actor,
        key: input.idempotencyKey,
        operation,
        payload: { decision: input.decision, note: input.note },
      });
      if (idempotency.record) {
        return this.loadReview(client, {
          actor: input.actor,
          accessRole: access.role,
          documentId: input.documentId,
          projectId: input.projectId,
          reviewRequestId: input.reviewRequestId,
        });
      }
      const review = await this.lockReview(
        client,
        input.actor.organizationId,
        input.documentId,
        input.reviewRequestId,
      );
      if (review.status !== 'open') {
        throw new ReviewOperationError('review_closed');
      }
      if (
        !canDecide(access.role) ||
        review.version_author_id === input.actor.userId
      ) {
        throw new ReviewOperationError('denied');
      }
      const assignment = await client.query(
        `select 1
           from review_assignments assignment
           join memberships membership
            on membership.organization_id = assignment.organization_id
            and membership.user_id = assignment.reviewer_user_id
            and membership.status = 'active'
           join project_memberships project_membership
            on project_membership.organization_id = assignment.organization_id
            and project_membership.project_id = $4
            and project_membership.organization_membership_id = membership.id
            and project_membership.removed_at is null
            and project_membership.role in ('project_lead', 'reviewer')
          where assignment.organization_id = $1
            and assignment.review_request_id = $2
            and assignment.reviewer_user_id = $3`,
        [
          input.actor.organizationId,
          input.reviewRequestId,
          input.actor.userId,
          input.projectId,
        ],
      );
      if (!assignment.rowCount) throw new ReviewOperationError('denied');
      const prior = await client.query(
        `select 1 from review_decisions
          where review_request_id = $1 and reviewer_user_id = $2`,
        [input.reviewRequestId, input.actor.userId],
      );
      if (prior.rowCount) throw new ReviewOperationError('decision_exists');
      await client.query(
        `insert into review_decisions
          (organization_id, review_request_id, version_id, reviewer_user_id,
           decision, note)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          input.actor.organizationId,
          input.reviewRequestId,
          review.version_id,
          input.actor.userId,
          input.decision,
          input.note,
        ],
      );
      let outcome: ReviewRequestStatus = 'open';
      if (input.decision === 'changes_requested') {
        outcome = 'changes_requested';
      } else {
        const counts = await client.query<{
          approved: number;
          assigned: number;
        }>(
          `select
             (select count(*)::int from review_assignments
               where review_request_id = $1) as assigned,
             (select count(*)::int from review_decisions
               where review_request_id = $1 and decision = 'approved') as approved`,
          [input.reviewRequestId],
        );
        const count = counts.rows[0];
        if (count && count.assigned === count.approved) {
          if (
            review.approved_sequence !== null &&
            review.approved_sequence >= review.version_sequence
          ) {
            outcome = 'superseded';
          } else {
            outcome = 'approved';
            await client.query(
              `update document_branches
                  set approved_version_id = $2, approved_at = now(),
                      approved_by_user_id = $3, updated_at = now()
                where id = $1`,
              [review.branch_id, review.version_id, input.actor.userId],
            );
          }
        }
      }
      if (outcome !== 'open') {
        await client.query(
          `update review_requests
              set status = $2, closed_at = now(), closed_by_user_id = $3,
                  updated_at = now()
            where id = $1`,
          [input.reviewRequestId, outcome, input.actor.userId],
        );
      }
      await this.completeIdempotency(client, {
        actor: input.actor,
        keyHash: idempotency.keyHash,
        operation,
        reviewRequestId: input.reviewRequestId,
      });
      await this.audit(client, {
        action: 'review.decision_recorded',
        actor: input.actor,
        metadata: { decision: input.decision, outcome },
        requestId: input.requestId,
        targetId: input.reviewRequestId,
        targetType: 'review_request',
      });
      await this.event(client, {
        eventType: 'review.decision_recorded',
        organizationId: input.actor.organizationId,
        payload: {
          actorUserId: input.actor.userId,
          decision: input.decision,
          outcome,
          reviewRequestId: input.reviewRequestId,
        },
        reviewRequestId: input.reviewRequestId,
      });
      return this.loadReview(client, {
        actor: input.actor,
        accessRole: access.role,
        documentId: input.documentId,
        projectId: input.projectId,
        reviewRequestId: input.reviewRequestId,
      });
    });
  }

  public async cancelReview(input: {
    actor: ProjectActor;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
  }): Promise<ReviewRequestSummary> {
    return transaction(this.pool, async (client) => {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
      );
      const operation = `review.cancel:${input.reviewRequestId}`;
      const idempotency = await this.claimIdempotency(client, {
        actor: input.actor,
        key: input.idempotencyKey,
        operation,
        payload: {},
      });
      if (!idempotency.record) {
        const review = await this.lockReview(
          client,
          input.actor.organizationId,
          input.documentId,
          input.reviewRequestId,
        );
        if (
          review.status === 'open' &&
          (access.role === 'project_lead' ||
            review.requested_by_user_id === input.actor.userId)
        ) {
          await client.query(
            `update review_requests
                set status = 'cancelled', closed_at = now(),
                    closed_by_user_id = $2, updated_at = now()
              where id = $1`,
            [input.reviewRequestId, input.actor.userId],
          );
          await this.audit(client, {
            action: 'review.cancelled',
            actor: input.actor,
            requestId: input.requestId,
            targetId: input.reviewRequestId,
            targetType: 'review_request',
          });
          await this.event(client, {
            eventType: 'review.cancelled',
            organizationId: input.actor.organizationId,
            payload: {
              actorUserId: input.actor.userId,
              reviewRequestId: input.reviewRequestId,
            },
            reviewRequestId: input.reviewRequestId,
          });
        } else if (review.status !== 'cancelled') {
          throw new ReviewOperationError(
            review.status === 'open' ? 'denied' : 'review_closed',
          );
        }
        await this.completeIdempotency(client, {
          actor: input.actor,
          keyHash: idempotency.keyHash,
          operation,
          reviewRequestId: input.reviewRequestId,
        });
      }
      return this.loadReview(client, {
        actor: input.actor,
        accessRole: access.role,
        documentId: input.documentId,
        projectId: input.projectId,
        reviewRequestId: input.reviewRequestId,
      });
    });
  }

  public async createThread(input: {
    actor: ProjectActor;
    anchor: ReviewThreadAnchor | null;
    body: string;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
  }): Promise<ReviewRequestSummary> {
    return transaction(this.pool, async (client) => {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
      );
      const operation = `review.thread.create:${input.reviewRequestId}`;
      const idempotency = await this.claimIdempotency(client, {
        actor: input.actor,
        key: input.idempotencyKey,
        operation,
        payload: { anchor: input.anchor, body: input.body },
      });
      if (!idempotency.record) {
        const review = await this.lockReview(
          client,
          input.actor.organizationId,
          input.documentId,
          input.reviewRequestId,
        );
        if (review.status !== 'open') {
          throw new ReviewOperationError('review_closed');
        }
        if (!canComment(access.role)) {
          throw new ReviewOperationError('denied');
        }
        const count = await client.query<{ count: number }>(
          `select count(*)::int as count from review_threads
            where review_request_id = $1`,
          [input.reviewRequestId],
        );
        if ((count.rows[0]?.count ?? 0) >= 100) {
          throw new ReviewOperationError('limit_reached');
        }
        if (input.anchor) {
          const anchor = await client.query(
            `select 1 from version_comparisons comparison,
                    jsonb_array_elements(comparison.changes) change
              where comparison.organization_id = $1
                and comparison.document_id = $2 and comparison.id = $3
                and comparison.id = $4 and comparison.status = 'completed'
                and comparison.target_version_id = $5
                and change->>'id' = $6 and change->>'path' = $7
                and change->>'label' = $8 and change->>'category' = $9`,
            [
              input.actor.organizationId,
              input.documentId,
              review.comparison_id,
              input.anchor.comparisonId,
              review.version_id,
              input.anchor.changeId,
              input.anchor.path,
              input.anchor.label,
              input.anchor.category,
            ],
          );
          if (!anchor.rowCount)
            throw new ReviewOperationError('invalid_anchor');
        }
        const thread = await client.query<{ id: string }>(
          `insert into review_threads
            (organization_id, review_request_id, comparison_id, anchor_type,
             anchor_change_id, anchor_path, anchor_label, anchor_category,
             created_by_user_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
          [
            input.actor.organizationId,
            input.reviewRequestId,
            input.anchor?.comparisonId ?? null,
            input.anchor ? 'comparison_change' : 'general',
            input.anchor?.changeId ?? null,
            input.anchor?.path ?? null,
            input.anchor?.label ?? null,
            input.anchor?.category ?? null,
            input.actor.userId,
          ],
        );
        const threadId = thread.rows[0]?.id;
        if (!threadId) throw new Error('Review thread was not created.');
        await client.query(
          `insert into review_comments
            (organization_id, thread_id, author_user_id, body)
           values ($1, $2, $3, $4)`,
          [
            input.actor.organizationId,
            threadId,
            input.actor.userId,
            input.body,
          ],
        );
        await this.completeIdempotency(client, {
          actor: input.actor,
          keyHash: idempotency.keyHash,
          operation,
          reviewRequestId: input.reviewRequestId,
        });
        await this.audit(client, {
          action: 'review.thread_created',
          actor: input.actor,
          metadata: { anchored: Boolean(input.anchor) },
          requestId: input.requestId,
          targetId: threadId,
          targetType: 'review_thread',
        });
        await this.event(client, {
          eventType: 'review.thread_created',
          organizationId: input.actor.organizationId,
          payload: {
            actorUserId: input.actor.userId,
            reviewRequestId: input.reviewRequestId,
            threadId,
          },
          reviewRequestId: input.reviewRequestId,
        });
      }
      return this.loadReview(client, {
        actor: input.actor,
        accessRole: access.role,
        documentId: input.documentId,
        projectId: input.projectId,
        reviewRequestId: input.reviewRequestId,
      });
    });
  }

  public async addComment(input: {
    actor: ProjectActor;
    body: string;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
    threadId: string;
  }): Promise<ReviewRequestSummary> {
    return transaction(this.pool, async (client) => {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
      );
      const operation = `review.comment.create:${input.threadId}`;
      const idempotency = await this.claimIdempotency(client, {
        actor: input.actor,
        key: input.idempotencyKey,
        operation,
        payload: { body: input.body },
      });
      if (!idempotency.record) {
        const thread = await client.query<{
          review_status: ReviewRequestStatus;
          thread_status: 'open' | 'resolved';
        }>(
          `select thread.status as thread_status,
                  review.status as review_status
             from review_threads thread
             join review_requests review on review.id = thread.review_request_id
            where thread.organization_id = $1 and thread.id = $2
              and review.id = $3 and review.document_id = $4
            for update of thread, review`,
          [
            input.actor.organizationId,
            input.threadId,
            input.reviewRequestId,
            input.documentId,
          ],
        );
        const row = thread.rows[0];
        if (!row) throw new ReviewOperationError('not_found');
        if (row.review_status !== 'open' || row.thread_status !== 'open') {
          throw new ReviewOperationError('review_closed');
        }
        if (!canComment(access.role)) {
          throw new ReviewOperationError('denied');
        }
        const count = await client.query<{ count: number }>(
          `select count(*)::int as count from review_comments
            where thread_id = $1`,
          [input.threadId],
        );
        if ((count.rows[0]?.count ?? 0) >= 200) {
          throw new ReviewOperationError('limit_reached');
        }
        const comment = await client.query<{ id: string }>(
          `insert into review_comments
            (organization_id, thread_id, author_user_id, body)
           values ($1, $2, $3, $4) returning id`,
          [
            input.actor.organizationId,
            input.threadId,
            input.actor.userId,
            input.body,
          ],
        );
        const commentId = comment.rows[0]?.id;
        if (!commentId) throw new Error('Review comment was not created.');
        await this.completeIdempotency(client, {
          actor: input.actor,
          keyHash: idempotency.keyHash,
          operation,
          reviewRequestId: input.reviewRequestId,
        });
        await this.audit(client, {
          action: 'review.comment_added',
          actor: input.actor,
          requestId: input.requestId,
          targetId: commentId,
          targetType: 'review_comment',
        });
        await this.event(client, {
          eventType: 'review.comment_added',
          organizationId: input.actor.organizationId,
          payload: {
            actorUserId: input.actor.userId,
            commentId,
            reviewRequestId: input.reviewRequestId,
            threadId: input.threadId,
          },
          reviewRequestId: input.reviewRequestId,
        });
      }
      return this.loadReview(client, {
        actor: input.actor,
        accessRole: access.role,
        documentId: input.documentId,
        projectId: input.projectId,
        reviewRequestId: input.reviewRequestId,
      });
    });
  }

  public async resolveThread(input: {
    actor: ProjectActor;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
    threadId: string;
  }): Promise<ReviewRequestSummary> {
    return transaction(this.pool, async (client) => {
      const access = await this.requireAccess(
        client,
        input.actor,
        input.projectId,
        input.documentId,
      );
      const operation = `review.thread.resolve:${input.threadId}`;
      const idempotency = await this.claimIdempotency(client, {
        actor: input.actor,
        key: input.idempotencyKey,
        operation,
        payload: {},
      });
      if (!idempotency.record) {
        const result = await client.query<{
          created_by_user_id: string;
          requested_by_user_id: string;
          review_status: ReviewRequestStatus;
          status: 'open' | 'resolved';
        }>(
          `select thread.status, thread.created_by_user_id,
                  review.requested_by_user_id,
                  review.status as review_status
             from review_threads thread
             join review_requests review on review.id = thread.review_request_id
            where thread.organization_id = $1 and thread.id = $2
              and review.id = $3 and review.document_id = $4
            for update of thread`,
          [
            input.actor.organizationId,
            input.threadId,
            input.reviewRequestId,
            input.documentId,
          ],
        );
        const thread = result.rows[0];
        if (!thread) throw new ReviewOperationError('not_found');
        if (thread.review_status !== 'open') {
          throw new ReviewOperationError('review_closed');
        }
        if (
          access.role !== 'project_lead' &&
          thread.created_by_user_id !== input.actor.userId &&
          thread.requested_by_user_id !== input.actor.userId
        ) {
          throw new ReviewOperationError('denied');
        }
        if (thread.status === 'open') {
          await client.query(
            `update review_threads
                set status = 'resolved', resolved_at = now(),
                    resolved_by_user_id = $2, updated_at = now()
              where id = $1`,
            [input.threadId, input.actor.userId],
          );
          await this.audit(client, {
            action: 'review.thread_resolved',
            actor: input.actor,
            requestId: input.requestId,
            targetId: input.threadId,
            targetType: 'review_thread',
          });
          await this.event(client, {
            eventType: 'review.thread_resolved',
            organizationId: input.actor.organizationId,
            payload: {
              actorUserId: input.actor.userId,
              reviewRequestId: input.reviewRequestId,
              threadId: input.threadId,
            },
            reviewRequestId: input.reviewRequestId,
          });
        }
        await this.completeIdempotency(client, {
          actor: input.actor,
          keyHash: idempotency.keyHash,
          operation,
          reviewRequestId: input.reviewRequestId,
        });
      }
      return this.loadReview(client, {
        actor: input.actor,
        accessRole: access.role,
        documentId: input.documentId,
        projectId: input.projectId,
        reviewRequestId: input.reviewRequestId,
      });
    });
  }
}
