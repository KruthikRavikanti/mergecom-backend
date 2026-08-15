import { useAuth } from '../../auth/AuthContext';
import { roleLabels } from '../../auth/roles';
import { ProfilePanel } from './ProfilePanel';
import { ServiceStatusPanel } from './ServiceStatusPanel';

export function SettingsPage() {
  const { user } = useAuth();
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
