import {
  Building2,
  FolderKanban,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useSwitchOrganizationMutation } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { canManageAccess, roleLabels } from '../../auth/roles';
import { Brand } from './Brand';

const navigation = [
  { icon: FolderKanban, label: 'Projects', to: '/app' },
  { icon: Users, label: 'Team', to: '/app/team' },
  { icon: Settings, label: 'Settings', to: '/app/settings' },
  {
    adminOnly: true,
    icon: ShieldCheck,
    label: 'Administration',
    to: '/app/admin',
  },
];

export function AppLayout() {
  const { signOut, user } = useAuth();
  const switchOrganization = useSwitchOrganizationMutation();
  const [logoutFailed, setLogoutFailed] = useState(false);
  if (!user) return null;
  const active = user.activeOrganization;
  const visibleNavigation = navigation.filter(
    (item) => !item.adminOnly || canManageAccess(active?.role),
  );

  const logout = async () => {
    setLogoutFailed(false);
    try {
      await signOut();
    } catch {
      setLogoutFailed(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-slate-800 bg-slate-950 text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center px-4 lg:px-5">
          <Brand inverse />
        </div>
        <nav
          aria-label="Workspace"
          className="grid grid-cols-4 gap-1 px-3 pb-3 sm:flex sm:overflow-x-auto lg:block lg:space-y-1 lg:pb-0"
        >
          {visibleNavigation.map(({ icon: Icon, label, to }) => (
            <NavLink
              className={({ isActive }) =>
                `flex min-w-0 shrink-0 items-center justify-center gap-3 rounded px-2 py-2.5 text-sm font-medium sm:justify-start sm:px-3 ${isActive ? 'bg-red-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`
              }
              end={to === '/app'}
              key={to}
              title={label}
              to={to}
            >
              <Icon aria-hidden="true" size={18} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-slate-800 p-4 lg:absolute lg:bottom-0 lg:block lg:w-[240px]">
          <p className="truncate text-sm font-semibold">
            {user.user.displayName}
          </p>
          <p className="truncate text-xs text-slate-400">{user.user.email}</p>
          {active ? (
            <p className="mt-1 truncate text-xs text-slate-400">
              {roleLabels[active.role]}
            </p>
          ) : null}
          <button
            className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white"
            type="button"
            onClick={() => void logout()}
          >
            <LogOut aria-hidden="true" size={15} /> Sign out
          </button>
          {logoutFailed ? (
            <p className="mt-2 text-xs text-red-300" role="alert">
              Sign out failed.
            </p>
          ) : null}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Building2
              aria-hidden="true"
              className="shrink-0 text-slate-500"
              size={18}
            />
            {user.organizations.length > 1 ? (
              <select
                aria-label="Active workspace"
                className="max-w-[14rem] border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700"
                disabled={switchOrganization.isPending}
                value={active?.id ?? ''}
                onChange={(event) =>
                  switchOrganization.mutate({
                    csrfToken: user.session.csrfToken,
                    organizationId: event.target.value,
                  })
                }
              >
                {!active ? <option value="">Select workspace</option> : null}
                {user.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="truncate text-sm font-semibold text-slate-700">
                {active?.name ?? 'Workspace access pending'}
              </p>
            )}
          </div>
          <button
            aria-label="Sign out"
            className="rounded p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            type="button"
            onClick={() => void logout()}
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          {!active || active.status !== 'active' ? (
            <section className="border-l-4 border-red-700 bg-white p-6 shadow-sm">
              <p className="text-sm font-bold text-red-700">ACCESS STATUS</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">
                {active?.status === 'suspended'
                  ? 'Workspace access suspended'
                  : 'Workspace access required'}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                Contact an organization administrator to restore access or send
                an invitation to your verified email address.
              </p>
            </section>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
