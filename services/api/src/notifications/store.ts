import type {
  NotificationPage,
  NotificationPreferences,
  UserNotification,
} from './types';

export class NotificationOperationError extends Error {
  public constructor(
    public readonly code: 'email_unverified' | 'invalid_cursor' | 'not_found',
  ) {
    super(code);
  }
}

export interface NotificationActor {
  organizationId: string;
  userId: string;
}

export interface NotificationStore {
  getPreferences(actor: NotificationActor): Promise<NotificationPreferences>;
  list(input: {
    actor: NotificationActor;
    cursor?: string | undefined;
    limit: number;
    unreadOnly: boolean;
  }): Promise<NotificationPage>;
  markAllRead(input: {
    actor: NotificationActor;
    requestId: string;
  }): Promise<{ updatedCount: number }>;
  markRead(input: {
    actor: NotificationActor;
    notificationId: string;
    requestId: string;
  }): Promise<UserNotification>;
  updatePreferences(input: {
    actor: NotificationActor;
    emailDocumentActivity: boolean;
    emailReviewActivity: boolean;
    inAppDocumentActivity: boolean;
    inAppReviewActivity: boolean;
    requestId: string;
  }): Promise<NotificationPreferences>;
}
