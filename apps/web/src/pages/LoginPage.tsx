import { Building2 } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { DevelopmentLoginAction } from '@mergecom/development-login';

import { apiUrl } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { DevelopmentIdentity } from '../auth/session';

function safeReturnTo(search: string): string {
  const candidate = new URLSearchParams(search).get('returnTo');
  return candidate?.startsWith('/app') ? candidate : '/app';
}

export function LoginPage({ signup = false }: { signup?: boolean }) {
  const { error, isLoading, signInDevelopment, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (user) {
    return <Navigate replace to={safeReturnTo(location.search)} />;
  }

  const enterDevelopment = async (identity: DevelopmentIdentity) => {
    await signInDevelopment(identity);
    await navigate(safeReturnTo(location.search), { replace: true });
  };
  const returnTo = safeReturnTo(location.search);
  const microsoftUrl = `${apiUrl('/auth/login')}?returnTo=${encodeURIComponent(returnTo)}`;
  const authenticationFailed =
    new URLSearchParams(location.search).get('error') ===
    'authentication_failed';

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
          {signup
            ? 'Workspace access requires an invitation from an administrator or an approved Microsoft tenant policy.'
            : 'Use your verified Microsoft work identity. Workspace access and permissions are assigned by your organization.'}
        </p>
        <a
          aria-disabled={isLoading}
          className="button-primary mt-6 w-full"
          href={microsoftUrl}
        >
          <Building2 aria-hidden="true" size={18} />
          Continue with Microsoft
        </a>
        <DevelopmentLoginAction onAuthenticate={enterDevelopment} />
        {authenticationFailed || error ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            Sign-in could not be completed. Try again or contact your
            administrator.
          </p>
        ) : null}
        <p className="mt-6 text-center text-sm text-slate-600">
          {signup ? 'Already have access?' : 'Need workspace access?'}{' '}
          <Link
            className="font-semibold text-red-700 hover:underline"
            to={signup ? '/login' : '/signup'}
          >
            {signup ? 'Sign in' : 'How access works'}
          </Link>
        </p>
      </section>
    </main>
  );
}
