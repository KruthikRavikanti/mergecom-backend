import type { components } from '@mergecom/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { redirect } from 'react-router-dom';

import { apiClient } from '../api/client';

export type CurrentUser = components['schemas']['CurrentUser'];
export type OrganizationRole = components['schemas']['OrganizationRole'];
export type DevelopmentIdentity =
  | 'alpha-owner'
  | 'alpha-admin'
  | 'alpha-project-lead'
  | 'alpha-contributor'
  | 'alpha-reviewer'
  | 'alpha-viewer'
  | 'alpha-external-reviewer'
  | 'beta-owner';

export const currentUserQueryKey = ['identity', 'current-user'] as const;

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const { data, error, response } = await apiClient.GET('/v1/me');
  if (response.status === 401) return null;
  if (!response.ok || !data) {
    throw new Error(
      error && 'message' in error
        ? error.message
        : 'Identity service is unavailable.',
    );
  }
  return data;
}

export const currentUserQueryOptions = () =>
  queryOptions({
    queryFn: fetchCurrentUser,
    queryKey: currentUserQueryKey,
    retry: false,
    staleTime: 30_000,
  });

export function protectedRouteLoader(queryClient: QueryClient) {
  return async ({ request }: { request: Request }) => {
    const currentUser = await queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    if (currentUser) return null;
    const url = new URL(request.url);
    const returnTo = `${url.pathname}${url.search}${url.hash}`;
    return redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  };
}
