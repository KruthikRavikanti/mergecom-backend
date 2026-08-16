import type { Pool, PoolClient } from 'pg';

import {
  NotificationOperationError,
  type NotificationActor,
  type NotificationStore,
} from './store';
import type {
  NotificationPage,
  NotificationPreferences,
  UserNotification,
} from './types';

interface PreferenceRow {
  email_available: boolean;
  email_document_activity: boolean;
  email_review_activity: boolean;
  in_app_document_activity: boolean;
  in_app_review_activity: boolean;
  updated_at: Date;
}

interface NotificationRow {
  body: string;
  category: UserNotification['category'];
  created_at: Date;
  event_type: string;
  href: string;
  id: string;
  read_at: Date | null;
  title: string;
}

const notificationColumns = `
  n.id, n.category, n.event_type, n.title, n.body, n.href,
  n.read_at, n.created_at`;

function mapPreference(row: PreferenceRow): NotificationPreferences {
  return {
    emailAvailable: row.email_available,
    emailDocumentActivity: row.email_document_activity,
    emailReviewActivity: row.email_review_activity,
    inAppDocumentActivity: row.in_app_document_activity,
    inAppReviewActivity: row.in_app_review_activity,
    updatedAt: row.updated_at,
  };
}

function mapNotification(row: NotificationRow): UserNotification {
  return {
    body: row.body,
    category: row.category,
    createdAt: row.created_at,
    eventType: row.event_type,
    href: row.href,
    id: row.id,
    readAt: row.read_at,
    title: row.title,
  };
}

function encodeCursor(row: NotificationRow): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.created_at.toISOString(), id: row.id }),
  ).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = new Date(String(parsed.createdAt));
    if (
      Number.isNaN(createdAt.getTime()) ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        parsed.id,
      )
    ) {
      throw new Error('invalid cursor');
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new NotificationOperationError('invalid_cursor');
  }
}

async function audit(
  client: PoolClient,
  input: {
    action: string;
    actor: NotificationActor;
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

export class PostgresNotificationStore implements NotificationStore {
  public constructor(private readonly pool: Pool) {}

  public async getPreferences(
    actor: NotificationActor,
  ): Promise<NotificationPreferences> {
    await this.pool.query(
      `insert into notification_preferences (organization_id, user_id)
       values ($1, $2)
       on conflict (organization_id, user_id) do nothing`,
      [actor.organizationId, actor.userId],
    );
    const result = await this.pool.query<PreferenceRow>(
      `select p.in_app_review_activity, p.email_review_activity,
              p.in_app_document_activity, p.email_document_activity,
              u.email_verified as email_available, p.updated_at
         from notification_preferences p
         join users u on u.id = p.user_id
        where p.organization_id = $1 and p.user_id = $2`,
      [actor.organizationId, actor.userId],
    );
    const row = result.rows[0];
    if (!row) throw new NotificationOperationError('not_found');
    return mapPreference(row);
  }

  public async updatePreferences(input: {
    actor: NotificationActor;
    emailDocumentActivity: boolean;
    emailReviewActivity: boolean;
    inAppDocumentActivity: boolean;
    inAppReviewActivity: boolean;
    requestId: string;
  }): Promise<NotificationPreferences> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<PreferenceRow>(
        `insert into notification_preferences
          (organization_id, user_id, in_app_review_activity,
           email_review_activity, in_app_document_activity,
           email_document_activity)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (organization_id, user_id) do update
           set in_app_review_activity = excluded.in_app_review_activity,
               email_review_activity = excluded.email_review_activity,
               in_app_document_activity = excluded.in_app_document_activity,
               email_document_activity = excluded.email_document_activity,
               updated_at = now()
         returning in_app_review_activity, email_review_activity,
                   in_app_document_activity, email_document_activity,
                   (select email_verified from users where id = $2) as email_available,
                   updated_at`,
        [
          input.actor.organizationId,
          input.actor.userId,
          input.inAppReviewActivity,
          input.emailReviewActivity,
          input.inAppDocumentActivity,
          input.emailDocumentActivity,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new NotificationOperationError('not_found');
      if (
        !row.email_available &&
        (input.emailReviewActivity || input.emailDocumentActivity)
      ) {
        throw new NotificationOperationError('email_unverified');
      }
      await audit(client, {
        action: 'notification.preferences_updated',
        actor: input.actor,
        metadata: {
          emailDocumentActivity: input.emailDocumentActivity,
          emailReviewActivity: input.emailReviewActivity,
          inAppDocumentActivity: input.inAppDocumentActivity,
          inAppReviewActivity: input.inAppReviewActivity,
        },
        requestId: input.requestId,
        targetId: input.actor.userId,
        targetType: 'notification_preferences',
      });
      await client.query('commit');
      return mapPreference(row);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  public async list(input: {
    actor: NotificationActor;
    cursor?: string | undefined;
    limit: number;
    unreadOnly: boolean;
  }): Promise<NotificationPage> {
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const result = await this.pool.query<NotificationRow>(
      `select ${notificationColumns}
         from user_notifications n
         join notification_deliveries delivery
           on delivery.notification_id = n.id
          and delivery.channel = 'in_app' and delivery.status = 'completed'
        where n.organization_id = $1 and n.recipient_user_id = $2
          and ($3::boolean = false or n.read_at is null)
          and ($4::timestamptz is null
            or (n.created_at, n.id) < ($4::timestamptz, $5::uuid))
        order by n.created_at desc, n.id desc
        limit $6`,
      [
        input.actor.organizationId,
        input.actor.userId,
        input.unreadOnly,
        cursor?.createdAt ?? null,
        cursor?.id ?? null,
        input.limit + 1,
      ],
    );
    const unread = await this.pool.query<{ count: number }>(
      `select count(*)::int as count
         from user_notifications n
         join notification_deliveries delivery
           on delivery.notification_id = n.id
          and delivery.channel = 'in_app' and delivery.status = 'completed'
        where n.organization_id = $1 and n.recipient_user_id = $2
          and n.read_at is null`,
      [input.actor.organizationId, input.actor.userId],
    );
    const hasMore = result.rows.length > input.limit;
    const rows = result.rows.slice(0, input.limit);
    return {
      items: rows.map(mapNotification),
      nextCursor:
        hasMore && rows.length > 0 ? encodeCursor(rows.at(-1)!) : null,
      unreadCount: unread.rows[0]?.count ?? 0,
    };
  }

  public async markRead(input: {
    actor: NotificationActor;
    notificationId: string;
    requestId: string;
  }): Promise<UserNotification> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<NotificationRow>(
        `update user_notifications n
            set read_at = coalesce(n.read_at, now())
          where n.id = $1 and n.organization_id = $2
            and n.recipient_user_id = $3
            and exists (select 1 from notification_deliveries d
              where d.notification_id = n.id and d.channel = 'in_app'
                and d.status = 'completed')
        returning ${notificationColumns.replaceAll('n.', '')}`,
        [input.notificationId, input.actor.organizationId, input.actor.userId],
      );
      const row = result.rows[0];
      if (!row) throw new NotificationOperationError('not_found');
      await audit(client, {
        action: 'notification.read',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.notificationId,
        targetType: 'user_notification',
      });
      await client.query('commit');
      return mapNotification(row);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  public async markAllRead(input: {
    actor: NotificationActor;
    requestId: string;
  }): Promise<{ updatedCount: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query(
        `update user_notifications n set read_at = now()
          where n.organization_id = $1 and n.recipient_user_id = $2
            and n.read_at is null
            and exists (select 1 from notification_deliveries d
              where d.notification_id = n.id and d.channel = 'in_app'
                and d.status = 'completed')`,
        [input.actor.organizationId, input.actor.userId],
      );
      await audit(client, {
        action: 'notification.all_read',
        actor: input.actor,
        metadata: { updatedCount: result.rowCount ?? 0 },
        requestId: input.requestId,
        targetId: input.actor.userId,
        targetType: 'user_notification',
      });
      await client.query('commit');
      return { updatedCount: result.rowCount ?? 0 };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
