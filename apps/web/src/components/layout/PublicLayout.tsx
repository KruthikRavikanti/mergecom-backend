import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { Brand } from './Brand';

const links = [
  { label: 'Security', to: '/security' },
  { label: 'Support', to: '/support' },
];

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <nav
            aria-label="Primary"
            className="hidden items-center gap-7 md:flex"
          >
            {links.map((link) => (
              <NavLink
                className="text-sm font-medium text-slate-600 hover:text-red-700"
                key={link.to}
                to={link.to}
              >
                {link.label}
              </NavLink>
            ))}
            <Link className="button-primary" to="/login">
              Sign in
            </Link>
          </nav>
          <button
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            className="rounded p-2 text-slate-700 md:hidden"
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
        {menuOpen ? (
          <nav
            aria-label="Mobile"
            className="border-t border-slate-200 px-4 py-3 md:hidden"
          >
            {links.map((link) => (
              <NavLink
                className="block py-2 text-sm font-medium"
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </NavLink>
            ))}
            <Link
              className="mt-2 block py-2 text-sm font-semibold text-red-700"
              to="/login"
              onClick={() => setMenuOpen(false)}
            >
              Sign in
            </Link>
          </nav>
        ) : null}
      </header>
      <Outlet />
      <footer className="border-t border-slate-200 bg-slate-950 text-slate-300">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Brand inverse />
          <p>Document review infrastructure under active development.</p>
        </div>
      </footer>
    </div>
  );
}
