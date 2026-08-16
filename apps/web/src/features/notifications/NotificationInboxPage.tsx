import { ErrorState, LoadingState, Toast } from '@mergecom/ui';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  FileClock,
  MessageSquareText,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  type UserNotification,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';

const dateFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function NotificationInboxPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const organizationId = user?.activeOrganization?.id;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notifications = useNotificationsQuery(organizationId, unreadOnly);
  const markRead = useMarkNotificationReadMutation(user!);
  const markAllRead = useMarkAllNotificationsReadMutation(user!);
  const items = useMemo(
    () => notifications.data?.pages.flatMap((page) => page.items) ?? [],
    [notifications.data],
  );
  const unreadCount = notifications.data?.pages[0]?.unreadCount ?? 0;
  if (!user) return null;

  const openNotification = async (notification: UserNotification) => {
    setError(null);
    try {
      if (!notification.readAt) await markRead.mutateAsync(notification.id);
      void navigate(notification.href);
    } catch {
      setError('Notification state could not be updated.');
    }
  };

  const markEverythingRead = async () => {
    setError(null);
    try {
      await markAllRead.mutateAsync();
    } catch {
      setError('Notifications could not be marked read.');
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-red-700">ACTIVITY</p>
          <h1 className="page-title mt-1">Notifications</h1>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={unreadCount === 0 || markAllRead.isPending}
          type="button"
          onClick={() => void markEverythingRead()}
        >
          <CheckCheck aria-hidden="true" size={17} /> Mark all read
        </button>
      </div>

      <div
        aria-label="Notification view"
        className="mt-6 inline-flex border border-slate-300 bg-white p-1"
        role="group"
      >
        <button
          aria-pressed={!unreadOnly}
          className={`h-9 px-4 text-sm font-bold ${!unreadOnly ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          type="button"
          onClick={() => setUnreadOnly(false)}
        >
          All
        </button>
        <button
          aria-pressed={unreadOnly}
          className={`h-9 px-4 text-sm font-bold ${unreadOnly ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          type="button"
          onClick={() => setUnreadOnly(true)}
        >
          Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
        </button>
      </div>

      <div className="mt-5 border border-slate-200 bg-white shadow-sm">
        {notifications.isPending ? (
          <div className="p-8">
            <LoadingState label="Loading notifications" />
          </div>
        ) : notifications.isError ? (
          <div className="p-8">
            <ErrorState message="Notifications could not be loaded." />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Bell
              aria-hidden="true"
              className="mx-auto text-slate-400"
              size={28}
            />
            <h2 className="mt-4 text-base font-bold text-slate-900">
              {unreadOnly ? 'No unread notifications' : 'No notifications'}
            </h2>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onOpen={() => void openNotification(notification)}
              />
            ))}
          </div>
        )}
      </div>

      {notifications.hasNextPage ? (
        <div className="mt-5 text-center">
          <button
            className="h-10 border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:border-slate-400 disabled:opacity-50"
            disabled={notifications.isFetchingNextPage}
            type="button"
            onClick={() => void notifications.fetchNextPage()}
          >
            {notifications.isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        </div>
      ) : null}
      {error ? <Toast kind="error" message={error} /> : null}
    </section>
  );
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: UserNotification;
  onOpen: () => void;
}) {
  const Icon =
    notification.category === 'review_activity' ? MessageSquareText : FileClock;
  return (
    <button
      className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4 px-5 py-5 text-left hover:bg-slate-50 sm:px-6 ${notification.readAt ? 'bg-white' : 'bg-red-50/40'}`}
      type="button"
      onClick={onOpen}
    >
      <span className="relative mt-0.5 flex h-9 w-9 items-center justify-center border border-slate-200 bg-white text-slate-600">
        <Icon aria-hidden="true" size={18} />
        {!notification.readAt ? (
          <span
            aria-label="Unread"
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-700"
          />
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-950">
          {notification.title}
        </span>
        <span className="mt-1 block text-sm leading-6 text-slate-600">
          {notification.body}
        </span>
        <span className="mt-2 block text-xs font-medium text-slate-500">
          {dateFormatter.format(new Date(notification.createdAt))}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="mt-2 shrink-0 text-slate-400"
        size={18}
      />
    </button>
  );
}
