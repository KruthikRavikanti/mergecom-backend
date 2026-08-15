import { Building2 } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { DemoLoginAction } from '@mergecom/demo-action';

import { useAuth } from '../auth/AuthContext';

function safeReturnTo(search: string): string {
  const candidate = new URLSearchParams(search).get('returnTo');
  return candidate?.startsWith('/app') ? candidate : '/app';
}

export function LoginPage({ signup = false }: { signup?: boolean }) {
  const { signInDemo, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (user) {
    return <Navigate replace to={safeReturnTo(location.search)} />;
  }

  const enterDemo = () => {
    signInDemo();
    navigate(safeReturnTo(location.search), { replace: true });
  };

  return (
    <main className="grid min-h-[calc(100vh-8rem)] place-items-center bg-slate-100 px-4 py-12">
      <section className="w-full max-w-md border-t-4 border-red-700 bg-white p-7 shadow-sm">
        <p className="text-sm font-bold text-red-700">
          {signup ? 'ACCESS REQUEST' : 'WORKSPACE ACCESS'}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          {signup ? 'Join MergeCom' : 'Sign in to MergeCom'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Microsoft Entra ID onboarding is scheduled for Phase 2. Password
          authentication is not part of this foundation.
        </p>
        <button className="button-primary mt-6 w-full" disabled type="button">
          <Building2 aria-hidden="true" size={18} />
          Continue with Microsoft
        </button>
        <DemoLoginAction onAuthenticate={enterDemo} />
        <p className="mt-6 text-center text-sm text-slate-600">
          {signup ? 'Already have access?' : 'Need workspace access?'}{' '}
          <Link
            className="font-semibold text-red-700 hover:underline"
            to={signup ? '/login' : '/signup'}
          >
            {signup ? 'Sign in' : 'Request access'}
          </Link>
        </p>
      </section>
    </main>
  );
}
