import { ErrorState, LoadingState, Toast } from '@mergecom/ui';
import { useState } from 'react';

import {
  type NotificationPreferences,
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { roleLabels } from '../../auth/roles';
import type { CurrentUser } from '../../auth/session';
import { NotificationPanel } from './NotificationPanel';
import { ProfilePanel } from './ProfilePanel';
import { ServiceStatusPanel } from './ServiceStatusPanel';

export function SettingsPage() {
  const { user } = useAuth();
  const organizationId = user?.activeOrganization?.id;
  const preferences = useNotificationPreferencesQuery(organizationId);
  if (!user) return null;

  return (
    <section>
      <p className="text-sm font-bold text-red-700">ACCOUNT</p>
      <h1 className="page-title mt-1">Settings</h1>
      <div className="mt-7 border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <ProfilePanel
          displayName={user.user.displayName}
          email={user.user.email}
          emailVerified={user.user.emailVerified}
        />
        {preferences.isError ? (
          <div className="border-b border-slate-200 py-7">
            <ErrorState message="Notification preferences could not be loaded." />
          </div>
        ) : preferences.isPending || !preferences.data ? (
          <div className="border-b border-slate-200 py-7">
            <LoadingState label="Loading notification preferences" />
          </div>
        ) : (
          <NotificationPreferencesForm
            key={preferences.data.updatedAt}
            initialPreferences={preferences.data}
            user={user}
          />
        )}
        <section className="border-b border-slate-200 py-7">
          <h2 className="text-lg font-bold text-slate-950">Workspace access</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                Organization
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {user.activeOrganization?.name ?? 'No active workspace'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                Assigned role
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {user.activeOrganization
                  ? roleLabels[user.activeOrganization.role]
                  : 'Not assigned'}
              </dd>
            </div>
          </dl>
        </section>
        <div className="pt-7">
          <ServiceStatusPanel />
        </div>
      </div>
    </section>
  );
}

function NotificationPreferencesForm({
  initialPreferences,
  user,
}: {
  initialPreferences: NotificationPreferences;
  user: CurrentUser;
}) {
  const updatePreferences = useUpdateNotificationPreferencesMutation(user);
  const [draft, setDraft] = useState(initialPreferences);
  const [saved, setSaved] = useState(false);

  const changePreference = (
    key:
      | 'emailDocumentActivity'
      | 'emailReviewActivity'
      | 'inAppDocumentActivity'
      | 'inAppReviewActivity',
    enabled: boolean,
  ) => {
    setSaved(false);
    const next = { ...draft, [key]: enabled };
    setDraft(next);
    updatePreferences.mutate(
      {
        emailDocumentActivity: next.emailDocumentActivity,
        emailReviewActivity: next.emailReviewActivity,
        inAppDocumentActivity: next.inAppDocumentActivity,
        inAppReviewActivity: next.inAppReviewActivity,
      },
      {
        onError: () => setDraft(initialPreferences),
        onSuccess: () => setSaved(true),
      },
    );
  };

  return (
    <>
      <NotificationPanel
        disabled={updatePreferences.isPending}
        preferences={draft}
        onChange={changePreference}
      />
      {saved ? <Toast kind="success" message="Preferences saved." /> : null}
      {updatePreferences.isError ? (
        <Toast kind="error" message="Preferences could not be saved." />
      ) : null}
    </>
  );
}
