import type { components } from '@mergecom/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { currentUserQueryKey, type CurrentUser } from '../auth/session';
import { demoAdapter } from '../demo/adapter';
import { apiClient } from './client';

type OrganizationRole = components['schemas']['OrganizationRole'];
type MembershipStatus = components['schemas']['MembershipStatus'];

export const queryKeys = {
  apiReadiness: ['api', 'readiness'] as const,
  members: (organizationId: string) =>
    ['identity', 'organizations', organizationId, 'memberships'] as const,
  project: (projectId: string) => ['demo', 'projects', projectId] as const,
  projects: ['demo', 'projects'] as const,
  versions: (projectId: string, documentId: string) =>
    [
      'demo',
      'projects',
      projectId,
      'documents',
      documentId,
      'versions',
    ] as const,
};

function failure(error: unknown, fallback: string): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String(error.message));
  }
  return new Error(fallback);
}

export function useApiReadinessQuery() {
  return useQuery({
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/health/ready');
      if (!response.ok || !data)
        throw new Error(error ? JSON.stringify(error) : 'API is unavailable.');
      return data;
    },
    queryKey: queryKeys.apiReadiness,
    retry: false,
  });
}

export function useProjectsQuery() {
  return useQuery({
    queryFn: () => demoAdapter.getProjects(),
    queryKey: queryKeys.projects,
  });
}

export function useProjectQuery(projectId: string) {
  return useQuery({
    queryFn: () => demoAdapter.getProject(projectId),
    queryKey: queryKeys.project(projectId),
  });
}

export function useVersionsQuery(projectId: string, documentId: string) {
  return useQuery({
    queryFn: () => demoAdapter.getVersions(projectId, documentId),
    queryKey: queryKeys.versions(projectId, documentId),
  });
}

export function useMembersQuery(organizationId: string | undefined) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/organizations/{organizationId}/memberships',
        { params: { path: { organizationId: organizationId! } } },
      );
      if (!response.ok || !data) {
        throw failure(error, 'Memberships could not be loaded.');
      }
      return data.memberships;
    },
    queryKey: queryKeys.members(organizationId ?? 'unavailable'),
  });
}

export function useSwitchOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      csrfToken,
      organizationId,
    }: {
      csrfToken: string;
      organizationId: string;
    }) => {
      const { data, error, response } = await apiClient.POST(
        '/v1/session/organization',
        {
          body: { organizationId },
          params: { header: { 'X-CSRF-Token': csrfToken } },
        },
      );
      if (!response.ok || !data) {
        throw failure(error, 'Workspace could not be switched.');
      }
      return data;
    },
    onSuccess: async (currentUser: CurrentUser) => {
      queryClient.setQueryData(currentUserQueryKey, currentUser);
      await queryClient.invalidateQueries({ queryKey: ['identity'] });
    },
  });
}

export function useCreateInvitationMutation(currentUser: CurrentUser) {
  return useMutation({
    mutationFn: async (input: { email: string; role: OrganizationRole }) => {
      const organizationId = currentUser.activeOrganization?.id;
      if (!organizationId) throw new Error('An active workspace is required.');
      const { data, error, response } = await apiClient.POST(
        '/v1/organizations/{organizationId}/invitations',
        {
          body: input,
          params: {
            header: {
              'X-CSRF-Token': currentUser.session.csrfToken,
            },
            path: { organizationId },
          },
        },
      );
      if (!response.ok || !data) {
        throw failure(error, 'Invitation could not be created.');
      }
      return data;
    },
  });
}

export function useChangeMembershipRoleMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      membershipId: string;
      role: OrganizationRole;
    }) => {
      const organizationId = currentUser.activeOrganization?.id;
      if (!organizationId) throw new Error('An active workspace is required.');
      const { error, response } = await apiClient.PATCH(
        '/v1/organizations/{organizationId}/memberships/{membershipId}/role',
        {
          body: { role: input.role },
          params: {
            header: {
              'X-CSRF-Token': currentUser.session.csrfToken,
            },
            path: { membershipId: input.membershipId, organizationId },
          },
        },
      );
      if (!response.ok) throw failure(error, 'Role could not be changed.');
    },
    onSuccess: async () => {
      if (currentUser.activeOrganization) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.members(currentUser.activeOrganization.id),
        });
      }
    },
  });
}

export function useChangeMembershipStatusMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      membershipId: string;
      status: MembershipStatus;
    }) => {
      const organizationId = currentUser.activeOrganization?.id;
      if (!organizationId) throw new Error('An active workspace is required.');
      const { error, response } = await apiClient.PATCH(
        '/v1/organizations/{organizationId}/memberships/{membershipId}/status',
        {
          body: { status: input.status },
          params: {
            header: {
              'X-CSRF-Token': currentUser.session.csrfToken,
            },
            path: { membershipId: input.membershipId, organizationId },
          },
        },
      );
      if (!response.ok) throw failure(error, 'Status could not be changed.');
    },
    onSuccess: async () => {
      if (currentUser.activeOrganization) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.members(currentUser.activeOrganization.id),
        });
      }
    },
  });
}

export function useRemoveMembershipMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const organizationId = currentUser.activeOrganization?.id;
      if (!organizationId) throw new Error('An active workspace is required.');
      const { error, response } = await apiClient.DELETE(
        '/v1/organizations/{organizationId}/memberships/{membershipId}',
        {
          params: {
            header: {
              'X-CSRF-Token': currentUser.session.csrfToken,
            },
            path: { membershipId, organizationId },
          },
        },
      );
      if (!response.ok)
        throw failure(error, 'Membership could not be removed.');
    },
    onSuccess: async () => {
      if (currentUser.activeOrganization) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.members(currentUser.activeOrganization.id),
        });
      }
    },
  });
}

export function useAcceptInvitationMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error, response } = await apiClient.POST(
        '/v1/invitations/accept',
        {
          body: { token },
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
          },
        },
      );
      if (!response.ok || !data) {
        throw failure(error, 'Invitation is invalid or unavailable.');
      }
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    },
  });
}
