import {
  FileClock,
  FolderKanban,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { Brand } from './Brand';

const navigation = [
  { icon: FolderKanban, label: 'Projects', to: '/app' },
  {
    icon: FileClock,
    label: 'Recent history',
    to: '/app/projects/proj-meridian/documents/doc-cim/history',
  },
  { icon: Users, label: 'Team', to: '/app/team' },
  { icon: Settings, label: 'Settings', to: '/app/settings' },
  { icon: ShieldCheck, label: 'Administration', to: '/app/admin' },
];

export function AppLayout() {
  const { signOut, user } = useAuth();
  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-slate-800 bg-slate-950 text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between px-4 lg:px-5">
          <Brand inverse />
          <span className="border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300">
            DEMO
          </span>
        </div>
        <nav
          aria-label="Workspace"
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:pb-0"
        >
          {navigation.map(({ icon: Icon, label, to }) => (
            <NavLink
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-red-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`
              }
              end={to === '/app'}
              key={to}
              to={to}
            >
              <Icon aria-hidden="true" size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-slate-800 p-4 lg:absolute lg:bottom-0 lg:block lg:w-[240px]">
          <p className="truncate text-sm font-semibold">{user?.displayName}</p>
          <p className="truncate text-xs text-slate-400">{user?.email}</p>
          <button
            className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white"
            type="button"
            onClick={signOut}
          >
            <LogOut aria-hidden="true" size={15} /> Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <p className="text-sm font-semibold text-slate-700">
            Document review workspace
          </p>
          <button
            aria-label="Sign out"
            className="rounded p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            type="button"
            onClick={signOut}
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
