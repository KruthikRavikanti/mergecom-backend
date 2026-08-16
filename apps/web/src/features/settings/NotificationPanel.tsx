import { Bell, Mail } from 'lucide-react';

import type { NotificationPreferences } from '../../api/queries';

type PreferenceKey =
  | 'emailDocumentActivity'
  | 'emailReviewActivity'
  | 'inAppDocumentActivity'
  | 'inAppReviewActivity';

export function NotificationPanel({
  disabled,
  onChange,
  preferences,
}: {
  disabled: boolean;
  onChange: (key: PreferenceKey, enabled: boolean) => void;
  preferences: NotificationPreferences;
}) {
  return (
    <section className="border-b border-slate-200 py-7">
      <h2 className="text-lg font-bold text-slate-950">Notifications</h2>
      <div className="mt-5 grid gap-7 lg:grid-cols-2">
        <PreferenceGroup
          description="Review requests, decisions, and discussions"
          disabled={disabled}
          emailAvailable={preferences.emailAvailable}
          emailEnabled={preferences.emailReviewActivity}
          icon={Bell}
          inAppEnabled={preferences.inAppReviewActivity}
          title="Review activity"
          onEmailChange={(enabled) => onChange('emailReviewActivity', enabled)}
          onInAppChange={(enabled) => onChange('inAppReviewActivity', enabled)}
        />
        <PreferenceGroup
          description="Version processing, comparisons, and merges"
          disabled={disabled}
          emailAvailable={preferences.emailAvailable}
          emailEnabled={preferences.emailDocumentActivity}
          icon={Mail}
          inAppEnabled={preferences.inAppDocumentActivity}
          title="Document activity"
          onEmailChange={(enabled) =>
            onChange('emailDocumentActivity', enabled)
          }
          onInAppChange={(enabled) =>
            onChange('inAppDocumentActivity', enabled)
          }
        />
      </div>
      {!preferences.emailAvailable ? (
        <p className="mt-4 text-sm text-amber-800">
          Email delivery is unavailable until the identity provider verifies
          your email address.
        </p>
      ) : null}
    </section>
  );
}

function PreferenceGroup({
  description,
  disabled,
  emailAvailable,
  emailEnabled,
  icon: Icon,
  inAppEnabled,
  onEmailChange,
  onInAppChange,
  title,
}: {
  description: string;
  disabled: boolean;
  emailAvailable: boolean;
  emailEnabled: boolean;
  icon: typeof Bell;
  inAppEnabled: boolean;
  onEmailChange: (enabled: boolean) => void;
  onInAppChange: (enabled: boolean) => void;
  title: string;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 text-slate-500" size={18} />
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3 pl-8">
        <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
          <input
            aria-label={`${title} in-app inbox`}
            checked={inAppEnabled}
            className="h-4 w-4 accent-red-700"
            disabled={disabled}
            type="checkbox"
            onChange={(event) => onInAppChange(event.target.checked)}
          />
          In-app inbox
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
          <input
            aria-label={`${title} email`}
            checked={emailEnabled}
            className="h-4 w-4 accent-red-700"
            disabled={disabled || !emailAvailable}
            type="checkbox"
            onChange={(event) => onEmailChange(event.target.checked)}
          />
          Email
        </label>
      </div>
    </div>
  );
}
