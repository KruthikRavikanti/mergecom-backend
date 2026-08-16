export interface NotificationPreferences {
  emailAvailable: boolean;
  emailDocumentActivity: boolean;
  emailReviewActivity: boolean;
  inAppDocumentActivity: boolean;
  inAppReviewActivity: boolean;
  updatedAt: Date;
}

export interface UserNotification {
  body: string;
  category: 'review_activity' | 'document_activity';
  createdAt: Date;
  eventType: string;
  href: string;
  id: string;
  readAt: Date | null;
  title: string;
}

export interface NotificationPage {
  items: UserNotification[];
  nextCursor: string | null;
  unreadCount: number;
}
