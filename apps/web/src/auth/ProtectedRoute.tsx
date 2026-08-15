import { ErrorState, LoadingState } from '@mergecom/ui';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './AuthContext';

export function ProtectedRoute() {
  const { error, isLoading, user } = useAuth();
  const location = useLocation();
  if (isLoading) return <LoadingState label="Loading secure session" />;
  if (error)
    return <ErrorState message="Your secure session could not be loaded." />;
  if (!user) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        replace
        to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
      />
    );
  }
  return <Outlet />;
}
