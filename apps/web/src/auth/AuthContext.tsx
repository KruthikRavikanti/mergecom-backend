import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import { apiClient } from '../api/client';
import {
  currentUserQueryKey,
  currentUserQueryOptions,
  type CurrentUser,
  type DevelopmentIdentity,
} from './session';

interface AuthContextValue {
  error: Error | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  signInDevelopment: (identity: DevelopmentIdentity) => Promise<void>;
  signOut: () => Promise<void>;
  user: CurrentUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function apiError(error: unknown, fallback: string): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String(error.message));
  }
  return new Error(fallback);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const currentUser = useQuery(currentUserQueryOptions());

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  }, [queryClient]);

  const signInDevelopment = useCallback(
    async (identity: DevelopmentIdentity) => {
      const { error, response } = await apiClient.POST(
        '/auth/development/session',
        { body: { identity } },
      );
      if (!response.ok) throw apiError(error, 'Development sign-in failed.');
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    const session = queryClient.getQueryData<CurrentUser | null>(
      currentUserQueryKey,
    );
    if (!session) return;
    const { data, error, response } = await apiClient.POST('/auth/logout', {
      params: {
        header: { 'X-CSRF-Token': session.session.csrfToken },
      },
    });
    if (!response.ok || !data) throw apiError(error, 'Sign out failed.');
    queryClient.setQueryData(currentUserQueryKey, null);
    window.location.assign(data.redirectTo);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      error: currentUser.error,
      isLoading: currentUser.isLoading,
      refresh,
      signInDevelopment,
      signOut,
      user: currentUser.data ?? null,
    }),
    [
      currentUser.data,
      currentUser.error,
      currentUser.isLoading,
      refresh,
      signInDevelopment,
      signOut,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
