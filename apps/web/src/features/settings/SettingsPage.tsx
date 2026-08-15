import { ErrorState, LoadingState, Toast } from '@mergecom/ui';
import { useState, type FormEvent } from 'react';

import { useSettingsQuery, useUpdateSettingsMutation } from '../../api/queries';
import type { DemoSettings } from '../../demo/types';
import { NotificationPanel } from './NotificationPanel';
import { ProfilePanel } from './ProfilePanel';
import { ServiceStatusPanel } from './ServiceStatusPanel';

function SettingsForm({ initial }: { initial: DemoSettings }) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(false);
  const update = useUpdateSettingsMutation();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    update.mutate(draft, { onSuccess: () => setSaved(true) });
  };
  return (
    <form
      className="mt-7 border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
      onSubmit={submit}
    >
      <ProfilePanel
        displayName={draft.displayName}
        title={draft.title}
        onDisplayNameChange={(displayName) =>
          setDraft((value) => ({ ...value, displayName }))
        }
        onTitleChange={(title) => setDraft((value) => ({ ...value, title }))}
      />
      <NotificationPanel
        enabled={draft.digestEnabled}
        onChange={(digestEnabled) =>
          setDraft((value) => ({ ...value, digestEnabled }))
        }
      />
      <ServiceStatusPanel />
      <div className="mt-7 flex justify-end">
        <button
          className="button-primary"
          disabled={update.isPending}
          type="submit"
        >
          {update.isPending ? 'Saving' : 'Save preferences'}
        </button>
      </div>
      {saved ? (
        <Toast kind="success" message="Development preferences saved." />
      ) : null}
      {update.isError ? (
        <Toast kind="error" message="Preferences could not be saved." />
      ) : null}
    </form>
  );
}

export function SettingsPage() {
  const settings = useSettingsQuery();
  if (settings.isLoading) return <LoadingState label="Loading settings" />;
  if (settings.isError || !settings.data)
    return <ErrorState message="Settings could not be loaded." />;
  return (
    <section>
      <p className="text-sm font-bold text-red-700">ACCOUNT</p>
      <h1 className="page-title mt-1">Settings</h1>
      <SettingsForm initial={settings.data} />
    </section>
  );
}
