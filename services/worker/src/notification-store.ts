import { Pool, type PoolClient } from 'pg';

const NOTIFIABLE_EVENT_TYPES = [
  'review.requested',
  'review.decision_recorded',
  'review.cancelled',
  'review.thread_created',
  'review.comment_added',
  'review.thread_resolved',
  'version.processing_finished',
  'version.comparison_finished',
  'version.merge_finished',
] as const;

interface LockedJobRow {
  attempts: number;
  lease_owner: string | null;
  max_attempts: number;
  organization_id: string;
  status: string;
}

interface OutboxRow {
  created_at: Date;
  event_type: string;
  id: string;
  organization_id: string;
  payload: Record<string, unknown>;
  status: string;
}

interface RecipientRow {
  email_document_activity: boolean;
  email_review_activity: boolean;
  email_verified: boolean;
  in_app_document_activity: boolean;
  in_app_review_activity: boolean;
  primary_email: string;
  user_id: string;
}

interface NotificationContext {
  actorUserId: string | null;
  body: string;
  category: 'document_activity' | 'review_activity';
  href: string;
  projectId: string;
  recipientUserIds: string[];
  title: string;
}

export interface ClaimedNotificationJob {
  attempts: number;
  id: string;
  maxAttempts: number;
}

export interface ClaimedEmailDelivery extends ClaimedNotificationJob {
  body: string;
  href: string;
  recipient: string;
  title: string;
}

export class PermanentNotificationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
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
    throw error;
  } finally {
    client.release();
  }
}

function payloadString(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === 'string' ? payload[key] : null;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

export class NotificationStore {
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

  public async reconcile(): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `update notification_dispatches
            set status = 'retryable_failed', available_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, updated_at = now(),
                last_error = 'The notification fan-out lease expired.'
          where status = 'running' and lease_expires_at <= now()
            and attempts < max_attempts`,
      );
      await client.query(
        `with exhausted as (
           update notification_dispatches
              set status = 'permanently_failed', completed_at = now(),
                  lease_owner = null, lease_expires_at = null,
                  heartbeat_at = null, failure_code = 'lease_exhausted',
                  last_error = 'All fan-out attempts ended with an expired lease.',
                  updated_at = now()
            where status = 'running' and lease_expires_at <= now()
              and attempts >= max_attempts
          returning outbox_event_id
         )
         update outbox_events o
            set status = 'failed', last_error = 'Notification fan-out exhausted all leases.'
           from exhausted e where o.id = e.outbox_event_id`,
      );
      await client.query(
        `update notification_deliveries
            set status = 'retryable_failed', available_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, updated_at = now(),
                last_error = 'The email delivery lease expired.'
          where channel = 'email' and status = 'running'
            and lease_expires_at <= now() and attempts < max_attempts`,
      );
      await client.query(
        `update notification_deliveries
            set status = 'permanently_failed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = 'lease_exhausted',
                last_error = 'All email attempts ended with an expired lease.',
                updated_at = now()
          where channel = 'email' and status = 'running'
            and lease_expires_at <= now() and attempts >= max_attempts`,
      );
      await client.query(
        `insert into notification_dispatches
          (outbox_event_id, organization_id)
         select id, organization_id from outbox_events
          where status = 'pending' and event_type = any($1::text[])
         on conflict (outbox_event_id) do nothing`,
        [NOTIFIABLE_EVENT_TYPES],
      );
    });
  }

  public async listDispatchable(limit = 100): Promise<string[]> {
    const result = await this.pool.query<{ outbox_event_id: string }>(
      `select outbox_event_id from notification_dispatches
        where status in ('queued', 'retryable_failed')
          and available_at <= now() and attempts < max_attempts
        order by available_at, created_at, outbox_event_id
        limit $1`,
      [limit],
    );
    return result.rows.map((row) => row.outbox_event_id);
  }

  public async listDispatchableEmails(limit = 100): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      `select id from notification_deliveries
        where channel = 'email' and status in ('queued', 'retryable_failed')
          and available_at <= now() and attempts < max_attempts
        order by available_at, created_at, id
        limit $1`,
      [limit],
    );
    return result.rows.map((row) => row.id);
  }

  public async claimDispatch(
    id: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedNotificationJob | null> {
    const result = await this.pool.query<{
      attempts: number;
      max_attempts: number;
      outbox_event_id: string;
    }>(
      `update notification_dispatches
          set status = 'running', attempts = attempts + 1,
              started_at = coalesce(started_at, now()), heartbeat_at = now(),
              lease_owner = $2,
              lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
              failure_code = null, last_error = null, updated_at = now()
        where outbox_event_id = $1
          and status in ('queued', 'retryable_failed')
          and available_at <= now() and attempts < max_attempts
      returning outbox_event_id, attempts, max_attempts`,
      [id, leaseOwner, leaseMilliseconds],
    );
    const row = result.rows[0];
    return row
      ? {
          attempts: row.attempts,
          id: row.outbox_event_id,
          maxAttempts: row.max_attempts,
        }
      : null;
  }

  public async heartbeatDispatch(
    id: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `update notification_dispatches
          set heartbeat_at = now(),
              lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
              updated_at = now()
        where outbox_event_id = $1 and status = 'running'
          and lease_owner = $2`,
      [id, leaseOwner, leaseMilliseconds],
    );
    return result.rowCount === 1;
  }

  public async fanOut(
    job: ClaimedNotificationJob,
    leaseOwner: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const locked = await this.lockDispatch(client, job.id);
      if (!locked || locked.status !== 'running') return;
      if (locked.lease_owner !== leaseOwner) {
        throw new Error('The notification fan-out lease is no longer owned.');
      }
      const eventResult = await client.query<OutboxRow>(
        `select id, organization_id, event_type, payload, status, created_at
           from outbox_events where id = $1 for update`,
        [job.id],
      );
      const event = eventResult.rows[0];
      if (!event) {
        throw new PermanentNotificationError(
          'notification_source_missing',
          'The source outbox event no longer exists.',
        );
      }
      const context = await this.context(client, event);
      const recipients = await this.recipients(
        client,
        event.organization_id,
        context.projectId,
        context.recipientUserIds.filter(
          (userId) => userId !== context.actorUserId,
        ),
      );
      for (const recipient of recipients) {
        const notificationResult = await client.query<{ id: string }>(
          `insert into user_notifications
            (organization_id, recipient_user_id, source_event_id, category,
             event_type, title, body, href, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (source_event_id, recipient_user_id) do nothing
           returning id`,
          [
            event.organization_id,
            recipient.user_id,
            event.id,
            context.category,
            event.event_type,
            context.title,
            context.body,
            context.href,
            event.created_at,
          ],
        );
        const notificationId =
          notificationResult.rows[0]?.id ??
          (
            await client.query<{ id: string }>(
              `select id from user_notifications
                where source_event_id = $1 and recipient_user_id = $2`,
              [event.id, recipient.user_id],
            )
          ).rows[0]?.id;
        if (!notificationId) {
          throw new Error('A recipient notification could not be persisted.');
        }
        const review = context.category === 'review_activity';
        const inAppEnabled = review
          ? recipient.in_app_review_activity
          : recipient.in_app_document_activity;
        const emailEnabled =
          recipient.email_verified &&
          (review
            ? recipient.email_review_activity
            : recipient.email_document_activity);
        await client.query(
          `insert into notification_deliveries
            (organization_id, notification_id, channel, status, completed_at)
           values ($1, $2, 'in_app', $3,
                   case when $3::notification_job_status in ('completed', 'suppressed') then now() end)
           on conflict (notification_id, channel) do nothing`,
          [
            event.organization_id,
            notificationId,
            inAppEnabled ? 'completed' : 'suppressed',
          ],
        );
        await client.query(
          `insert into notification_deliveries
            (organization_id, notification_id, channel, status,
             recipient_address, completed_at)
           values ($1, $2, 'email', $3, $4,
                   case when $3::notification_job_status = 'suppressed' then now() end)
           on conflict (notification_id, channel) do nothing`,
          [
            event.organization_id,
            notificationId,
            emailEnabled ? 'queued' : 'suppressed',
            emailEnabled ? recipient.primary_email : null,
          ],
        );
      }
      await client.query(
        `update outbox_events
            set status = 'published', published_at = coalesce(published_at, now()),
                last_error = null
          where id = $1`,
        [event.id],
      );
      await client.query(
        `update notification_dispatches
            set status = 'completed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = null, last_error = null,
                updated_at = now()
          where outbox_event_id = $1`,
        [event.id],
      );
    });
  }

  public async recordDispatchFailure(input: {
    error: string;
    failureCode: string;
    job: ClaimedNotificationJob;
    leaseOwner: string;
    retryAt: Date;
    retryable: boolean;
  }): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const locked = await this.lockDispatch(client, input.job.id);
      if (
        !locked ||
        locked.status !== 'running' ||
        locked.lease_owner !== input.leaseOwner
      ) {
        return false;
      }
      const retry = input.retryable && locked.attempts < locked.max_attempts;
      if (retry) {
        await client.query(
          `update notification_dispatches
              set status = 'retryable_failed', available_at = $2,
                  lease_owner = null, lease_expires_at = null,
                  heartbeat_at = null, failure_code = $3, last_error = $4,
                  updated_at = now()
            where outbox_event_id = $1`,
          [input.job.id, input.retryAt, input.failureCode, input.error],
        );
        return true;
      }
      await client.query(
        `update notification_dispatches
            set status = 'permanently_failed', completed_at = now(),
                lease_owner = null, lease_expires_at = null,
                heartbeat_at = null, failure_code = $2, last_error = $3,
                updated_at = now()
          where outbox_event_id = $1`,
        [input.job.id, input.failureCode, input.error],
      );
      await client.query(
        `update outbox_events set status = 'failed', last_error = $2
          where id = $1`,
        [input.job.id, input.error],
      );
      return false;
    });
  }

  public async claimEmail(
    id: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedEmailDelivery | null> {
    const result = await this.pool.query<{
      attempts: number;
      body: string;
      href: string;
      id: string;
      max_attempts: number;
      recipient_address: string;
      title: string;
    }>(
      `with claimed as (
         update notification_deliveries
            set status = 'running', attempts = attempts + 1,
                started_at = coalesce(started_at, now()), heartbeat_at = now(),
                lease_owner = $2,
                lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
                failure_code = null, last_error = null, updated_at = now()
          where id = $1 and channel = 'email'
            and status in ('queued', 'retryable_failed')
            and available_at <= now() and attempts < max_attempts
        returning *
       )
       select c.id, c.attempts, c.max_attempts, c.recipient_address,
              n.title, n.body, n.href
         from claimed c join user_notifications n on n.id = c.notification_id`,
      [id, leaseOwner, leaseMilliseconds],
    );
    const row = result.rows[0];
    return row
      ? {
          attempts: row.attempts,
          body: row.body,
          href: row.href,
          id: row.id,
          maxAttempts: row.max_attempts,
          recipient: row.recipient_address,
          title: row.title,
        }
      : null;
  }

  public async heartbeatEmail(
    id: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `update notification_deliveries
          set heartbeat_at = now(),
              lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
              updated_at = now()
        where id = $1 and channel = 'email' and status = 'running'
          and lease_owner = $2`,
      [id, leaseOwner, leaseMilliseconds],
    );
    return result.rowCount === 1;
  }

  public async completeEmail(
    id: string,
    leaseOwner: string,
    providerMessageId: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `update notification_deliveries
          set status = 'completed', completed_at = now(),
              lease_owner = null, lease_expires_at = null,
              heartbeat_at = null, failure_code = null, last_error = null,
              provider_message_id = $3, updated_at = now()
        where id = $1 and channel = 'email' and status = 'running'
          and lease_owner = $2`,
      [id, leaseOwner, providerMessageId],
    );
    if (result.rowCount !== 1) {
      throw new Error('The email delivery lease is no longer owned.');
    }
  }

  public async recordEmailFailure(input: {
    delivery: ClaimedEmailDelivery;
    error: string;
    failureCode: string;
    leaseOwner: string;
    retryAt: Date;
  }): Promise<boolean> {
    const retry = input.delivery.attempts < input.delivery.maxAttempts;
    const result = await this.pool.query(
      `update notification_deliveries
          set status = $3, available_at = case when $3 = 'retryable_failed' then $4 else available_at end,
              completed_at = case when $3 = 'permanently_failed' then now() end,
              lease_owner = null, lease_expires_at = null,
              heartbeat_at = null, failure_code = $5, last_error = $6,
              updated_at = now()
        where id = $1 and channel = 'email' and status = 'running'
          and lease_owner = $2`,
      [
        input.delivery.id,
        input.leaseOwner,
        retry ? 'retryable_failed' : 'permanently_failed',
        input.retryAt,
        input.failureCode,
        input.error,
      ],
    );
    return result.rowCount === 1 && retry;
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  private async lockDispatch(client: PoolClient, id: string) {
    const result = await client.query<LockedJobRow>(
      `select organization_id, status, attempts, max_attempts, lease_owner
         from notification_dispatches where outbox_event_id = $1 for update`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  private async recipients(
    client: PoolClient,
    organizationId: string,
    projectId: string,
    userIds: string[],
  ): Promise<RecipientRow[]> {
    if (userIds.length === 0) return [];
    const result = await client.query<RecipientRow>(
      `select m.user_id, u.primary_email, u.email_verified,
              coalesce(p.in_app_review_activity, true) as in_app_review_activity,
              coalesce(p.email_review_activity, false) as email_review_activity,
              coalesce(p.in_app_document_activity, true) as in_app_document_activity,
              coalesce(p.email_document_activity, false) as email_document_activity
         from memberships m
         join users u on u.id = m.user_id and u.disabled_at is null
         left join notification_preferences p
           on p.organization_id = m.organization_id and p.user_id = m.user_id
        where m.organization_id = $1 and m.status = 'active'
          and m.user_id = any($2::uuid[])
          and (m.role in ('owner', 'admin') or exists (
            select 1 from project_memberships pm
             where pm.organization_id = m.organization_id
               and pm.project_id = $3
               and pm.organization_membership_id = m.id
               and pm.removed_at is null))`,
      [organizationId, userIds, projectId],
    );
    return result.rows;
  }

  private async context(
    client: PoolClient,
    event: OutboxRow,
  ): Promise<NotificationContext> {
    if (event.event_type.startsWith('review.')) {
      return this.reviewContext(client, event);
    }
    if (event.event_type === 'version.processing_finished') {
      const versionId = payloadString(event.payload, 'versionId');
      const result = await client.query<{
        author_user_id: string;
        document_id: string;
        project_id: string;
      }>(
        `select v.author_user_id, v.document_id, d.project_id
           from document_versions v join documents d on d.id = v.document_id
          where v.organization_id = $1 and v.id = $2`,
        [event.organization_id, versionId],
      );
      const row = result.rows[0];
      if (!row) return this.missingSource();
      const outcome = payloadString(event.payload, 'outcome');
      return {
        actorUserId: null,
        body:
          outcome === 'completed'
            ? 'A document version finished processing and is ready.'
            : 'A document version needs attention after processing.',
        category: 'document_activity',
        href: `/app/projects/${row.project_id}/documents/${row.document_id}/history`,
        projectId: row.project_id,
        recipientUserIds: [row.author_user_id],
        title:
          outcome === 'completed'
            ? 'Version ready'
            : 'Version processing issue',
      };
    }
    if (event.event_type === 'version.comparison_finished') {
      const comparisonId = payloadString(event.payload, 'comparisonId');
      const result = await client.query<{
        document_id: string;
        project_id: string;
        requested_by_user_id: string;
      }>(
        `select c.document_id, c.requested_by_user_id, d.project_id
           from version_comparisons c join documents d on d.id = c.document_id
          where c.organization_id = $1 and c.id = $2`,
        [event.organization_id, comparisonId],
      );
      const row = result.rows[0];
      if (!row) return this.missingSource();
      const completed = payloadString(event.payload, 'outcome') === 'completed';
      return {
        actorUserId: null,
        body: completed
          ? 'A requested version comparison is ready.'
          : 'A requested version comparison needs attention.',
        category: 'document_activity',
        href: `/app/projects/${row.project_id}/documents/${row.document_id}/history/comparisons/${comparisonId}`,
        projectId: row.project_id,
        recipientUserIds: [row.requested_by_user_id],
        title: completed ? 'Comparison ready' : 'Comparison failed',
      };
    }
    if (event.event_type === 'version.merge_finished') {
      const mergeId = payloadString(event.payload, 'mergeId');
      const result = await client.query<{
        document_id: string;
        project_id: string;
        requested_by_user_id: string;
      }>(
        `select m.document_id, m.requested_by_user_id, d.project_id
           from merge_operations m join documents d on d.id = m.document_id
          where m.organization_id = $1 and m.id = $2`,
        [event.organization_id, mergeId],
      );
      const row = result.rows[0];
      if (!row) return this.missingSource();
      const outcome = payloadString(event.payload, 'outcome');
      return {
        actorUserId: null,
        body:
          outcome === 'completed'
            ? 'A requested merge created a new document version.'
            : outcome === 'manual_resolution_required'
              ? 'A requested merge requires manual resolution.'
              : 'A requested merge needs attention.',
        category: 'document_activity',
        href: `/app/projects/${row.project_id}/documents/${row.document_id}/history/merges/${mergeId}`,
        projectId: row.project_id,
        recipientUserIds: [row.requested_by_user_id],
        title:
          outcome === 'completed'
            ? 'Merge completed'
            : outcome === 'manual_resolution_required'
              ? 'Merge needs resolution'
              : 'Merge failed',
      };
    }
    throw new PermanentNotificationError(
      'notification_event_unsupported',
      'The outbox event is not supported by notification delivery.',
    );
  }

  private async reviewContext(
    client: PoolClient,
    event: OutboxRow,
  ): Promise<NotificationContext> {
    const reviewRequestId = payloadString(event.payload, 'reviewRequestId');
    const result = await client.query<{
      closed_by_user_id: string | null;
      document_id: string;
      project_id: string;
      requested_by_user_id: string;
      reviewer_user_ids: string[];
    }>(
      `select r.document_id, r.requested_by_user_id, r.closed_by_user_id,
              d.project_id,
              coalesce(array_agg(a.reviewer_user_id)
                filter (where a.reviewer_user_id is not null), '{}') as reviewer_user_ids
         from review_requests r
         join documents d on d.id = r.document_id
         left join review_assignments a on a.review_request_id = r.id
        where r.organization_id = $1 and r.id = $2
        group by r.id, d.project_id`,
      [event.organization_id, reviewRequestId],
    );
    const row = result.rows[0];
    if (!row) return this.missingSource();
    const actorUserId =
      payloadString(event.payload, 'actorUserId') ??
      (event.event_type === 'review.requested'
        ? row.requested_by_user_id
        : event.event_type === 'review.cancelled'
          ? row.closed_by_user_id
          : null);
    const allParticipants = unique([
      row.requested_by_user_id,
      ...row.reviewer_user_ids,
    ]);
    let href = `/app/projects/${row.project_id}/documents/${row.document_id}/history/reviews/${reviewRequestId}`;
    if (
      event.event_type === 'review.thread_created' ||
      event.event_type === 'review.comment_added' ||
      event.event_type === 'review.thread_resolved'
    ) {
      const threadId = payloadString(event.payload, 'threadId');
      const thread = await client.query<{
        anchor_change_id: string | null;
        comparison_id: string | null;
      }>(
        `select comparison_id, anchor_change_id
           from review_threads
          where organization_id = $1 and review_request_id = $2 and id = $3`,
        [event.organization_id, reviewRequestId, threadId],
      );
      const anchor = thread.rows[0];
      if (anchor?.comparison_id && anchor.anchor_change_id) {
        href = `/app/projects/${row.project_id}/documents/${row.document_id}/history/comparisons/${anchor.comparison_id}?change=${anchor.anchor_change_id}&mode=structured`;
      }
    }
    switch (event.event_type) {
      case 'review.requested':
        return {
          actorUserId,
          body: 'A document version is waiting for your review.',
          category: 'review_activity',
          href,
          projectId: row.project_id,
          recipientUserIds: row.reviewer_user_ids,
          title: 'Review requested',
        };
      case 'review.decision_recorded': {
        const decision = payloadString(event.payload, 'decision');
        return {
          actorUserId,
          body:
            decision === 'approved'
              ? 'A reviewer approved the requested document version.'
              : 'A reviewer requested changes to the document version.',
          category: 'review_activity',
          href,
          projectId: row.project_id,
          recipientUserIds: allParticipants,
          title:
            decision === 'approved' ? 'Review approved' : 'Changes requested',
        };
      }
      case 'review.cancelled':
        return {
          actorUserId,
          body: 'A document review request was cancelled.',
          category: 'review_activity',
          href,
          projectId: row.project_id,
          recipientUserIds: row.reviewer_user_ids,
          title: 'Review cancelled',
        };
      case 'review.thread_created':
        return {
          actorUserId,
          body: 'A new discussion was added to a document review.',
          category: 'review_activity',
          href,
          projectId: row.project_id,
          recipientUserIds: allParticipants,
          title: 'New review discussion',
        };
      case 'review.comment_added':
        return {
          actorUserId,
          body: 'A new comment was added to a document review.',
          category: 'review_activity',
          href,
          projectId: row.project_id,
          recipientUserIds: allParticipants,
          title: 'New review comment',
        };
      case 'review.thread_resolved':
        return {
          actorUserId,
          body: 'A discussion was resolved in a document review.',
          category: 'review_activity',
          href,
          projectId: row.project_id,
          recipientUserIds: allParticipants,
          title: 'Review discussion resolved',
        };
      default:
        throw new PermanentNotificationError(
          'notification_event_unsupported',
          'The review event is not supported by notification delivery.',
        );
    }
  }

  private missingSource(): never {
    throw new PermanentNotificationError(
      'notification_source_missing',
      'The notification source aggregate is unavailable.',
    );
  }
}
