import type { components } from '@mergecom/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { currentUserQueryKey, type CurrentUser } from '../auth/session';
import { apiClient } from './client';

type OrganizationRole = components['schemas']['OrganizationRole'];
type MembershipStatus = components['schemas']['MembershipStatus'];
export type ProjectRole = components['schemas']['ProjectRole'];
export type DocumentKind = components['schemas']['DocumentKind'];
export type Project = components['schemas']['Project'];
export type Folder = components['schemas']['Folder'];
export type Document = components['schemas']['Document'];
export type ProjectTeamMember = components['schemas']['ProjectTeamMember'];

export const queryKeys = {
  apiReadiness: ['api', 'readiness'] as const,
  members: (organizationId: string) =>
    ['identity', 'organizations', organizationId, 'memberships'] as const,
  project: (organizationId: string, projectId: string) =>
    ['projects', organizationId, projectId] as const,
  projects: (organizationId: string, archived: boolean) =>
    ['projects', organizationId, { archived }] as const,
  folders: (
    organizationId: string,
    projectId: string,
    folderId: string | null,
  ) => ['projects', organizationId, projectId, 'folders', folderId] as const,
  folderPath: (organizationId: string, projectId: string, folderId: string) =>
    [
      'projects',
      organizationId,
      projectId,
      'folders',
      folderId,
      'path',
    ] as const,
  documents: (
    organizationId: string,
    projectId: string,
    folderId: string | null,
    archived: boolean,
  ) =>
    [
      'projects',
      organizationId,
      projectId,
      'documents',
      folderId,
      { archived },
    ] as const,
  document: (organizationId: string, projectId: string, documentId: string) =>
    ['projects', organizationId, projectId, 'documents', documentId] as const,
  projectTeam: (organizationId: string, projectId: string) =>
    ['projects', organizationId, projectId, 'team'] as const,
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

export function useProjectsQuery(
  organizationId: string | undefined,
  archived = false,
) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/organizations/{organizationId}/projects',
        {
          params: {
            path: { organizationId: organizationId! },
            query: { archived, limit: 100 },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Projects could not be loaded.');
      return data;
    },
    queryKey: queryKeys.projects(organizationId ?? 'unavailable', archived),
  });
}

export function useProjectQuery(
  organizationId: string | undefined,
  projectId: string,
) {
  return useQuery({
    enabled: Boolean(organizationId && projectId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}',
        { params: { path: { organizationId: organizationId!, projectId } } },
      );
      if (!response.ok || !data)
        throw failure(error, 'Project could not be loaded.');
      return data;
    },
    queryKey: queryKeys.project(organizationId ?? 'unavailable', projectId),
  });
}

export function useFoldersQuery(
  organizationId: string | undefined,
  projectId: string,
  folderId: string | null,
) {
  return useQuery({
    enabled: Boolean(organizationId && projectId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}/folders',
        {
          params: {
            path: { organizationId: organizationId!, projectId },
            query: {
              limit: 100,
              ...(folderId ? { parentFolderId: folderId } : {}),
            },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Folders could not be loaded.');
      return data;
    },
    queryKey: queryKeys.folders(
      organizationId ?? 'unavailable',
      projectId,
      folderId,
    ),
  });
}

export function useFolderPathQuery(
  organizationId: string | undefined,
  projectId: string,
  folderId: string | null,
) {
  return useQuery({
    enabled: Boolean(organizationId && projectId && folderId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}/folders/{folderId}/path',
        {
          params: {
            path: {
              folderId: folderId!,
              organizationId: organizationId!,
              projectId,
            },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Folder path could not be loaded.');
      return data.items;
    },
    queryKey: queryKeys.folderPath(
      organizationId ?? 'unavailable',
      projectId,
      folderId ?? 'root',
    ),
  });
}

export function useDocumentsQuery(
  organizationId: string | undefined,
  projectId: string,
  folderId: string | null,
  archived = false,
) {
  return useQuery({
    enabled: Boolean(organizationId && projectId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}/documents',
        {
          params: {
            path: { organizationId: organizationId!, projectId },
            query: {
              archived,
              limit: 100,
              ...(folderId ? { folderId } : {}),
            },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Documents could not be loaded.');
      return data;
    },
    queryKey: queryKeys.documents(
      organizationId ?? 'unavailable',
      projectId,
      folderId,
      archived,
    ),
  });
}

export function useDocumentQuery(
  organizationId: string | undefined,
  projectId: string,
  documentId: string,
) {
  return useQuery({
    enabled: Boolean(organizationId && projectId && documentId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}',
        {
          params: {
            path: { documentId, organizationId: organizationId!, projectId },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Document could not be loaded.');
      return data;
    },
    queryKey: queryKeys.document(
      organizationId ?? 'unavailable',
      projectId,
      documentId,
    ),
  });
}

export function useProjectTeamQuery(
  organizationId: string | undefined,
  projectId: string,
) {
  return useQuery({
    enabled: Boolean(organizationId && projectId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}/team',
        {
          params: {
            path: { organizationId: organizationId!, projectId },
            query: { limit: 100 },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Project team could not be loaded.');
      return data;
    },
    queryKey: queryKeys.projectTeam(organizationId ?? 'unavailable', projectId),
  });
}

function activeOrganizationId(currentUser: CurrentUser): string {
  const organizationId = currentUser.activeOrganization?.id;
  if (!organizationId) throw new Error('An active workspace is required.');
  return organizationId;
}

async function invalidateProjectQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
) {
  await queryClient.invalidateQueries({
    queryKey: ['projects', organizationId],
  });
}

export function useCreateProjectMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientName: string | null; name: string }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { data, error, response } = await apiClient.POST(
        '/v1/organizations/{organizationId}/projects',
        {
          body: input,
          params: {
            header: {
              'Idempotency-Key': crypto.randomUUID(),
              'X-CSRF-Token': currentUser.session.csrfToken,
            },
            path: { organizationId },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Project could not be created.');
      return data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useUpdateProjectMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientName?: string | null;
      expectedUpdatedAt: string;
      name?: string;
      projectId: string;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { projectId, ...body } = input;
      const { data, error, response } = await apiClient.PATCH(
        '/v1/organizations/{organizationId}/projects/{projectId}',
        {
          body,
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
            path: { organizationId, projectId },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Project could not be updated.');
      return data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useArchiveProjectMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      archived: boolean;
      expectedUpdatedAt: string;
      projectId: string;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const options = {
        body: { expectedUpdatedAt: input.expectedUpdatedAt },
        params: {
          header: { 'X-CSRF-Token': currentUser.session.csrfToken },
          path: { organizationId, projectId: input.projectId },
        },
      } as const;
      const result = input.archived
        ? await apiClient.POST(
            '/v1/organizations/{organizationId}/projects/{projectId}/archive',
            options,
          )
        : await apiClient.POST(
            '/v1/organizations/{organizationId}/projects/{projectId}/restore',
            options,
          );
      if (!result.response.ok || !result.data) {
        throw failure(
          result.error,
          'Project archive state could not be changed.',
        );
      }
      return result.data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useDeleteProjectMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      expectedUpdatedAt: string;
      projectId: string;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { error, response } = await apiClient.DELETE(
        '/v1/organizations/{organizationId}/projects/{projectId}',
        {
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
            path: { organizationId, projectId: input.projectId },
            query: { expectedUpdatedAt: input.expectedUpdatedAt },
          },
        },
      );
      if (!response.ok) throw failure(error, 'Project could not be deleted.');
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useCreateFolderMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      parentFolderId: string | null;
      projectId: string;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { projectId, ...body } = input;
      const { data, error, response } = await apiClient.POST(
        '/v1/organizations/{organizationId}/projects/{projectId}/folders',
        {
          body,
          params: {
            header: {
              'Idempotency-Key': crypto.randomUUID(),
              'X-CSRF-Token': currentUser.session.csrfToken,
            },
            path: { organizationId, projectId },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Folder could not be created.');
      return data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useUpdateFolderMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      expectedUpdatedAt: string;
      folderId: string;
      name?: string;
      parentFolderId?: string | null;
      projectId: string;
      sortOrder?: number;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { folderId, projectId, ...body } = input;
      const { data, error, response } = await apiClient.PATCH(
        '/v1/organizations/{organizationId}/projects/{projectId}/folders/{folderId}',
        {
          body,
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
            path: { folderId, organizationId, projectId },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Folder could not be updated.');
      return data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useDeleteFolderMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      expectedUpdatedAt: string;
      folderId: string;
      projectId: string;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { error, response } = await apiClient.DELETE(
        '/v1/organizations/{organizationId}/projects/{projectId}/folders/{folderId}',
        {
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
            path: {
              folderId: input.folderId,
              organizationId,
              projectId: input.projectId,
            },
            query: { expectedUpdatedAt: input.expectedUpdatedAt },
          },
        },
      );
      if (!response.ok) throw failure(error, 'Folder could not be deleted.');
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useCreateDocumentMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      folderId: string | null;
      kind: DocumentKind;
      name: string;
      projectId: string;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { projectId, ...body } = input;
      const { data, error, response } = await apiClient.POST(
        '/v1/organizations/{organizationId}/projects/{projectId}/documents',
        {
          body,
          params: {
            header: {
              'Idempotency-Key': crypto.randomUUID(),
              'X-CSRF-Token': currentUser.session.csrfToken,
            },
            path: { organizationId, projectId },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Document could not be created.');
      return data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useUpdateDocumentMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      expectedUpdatedAt: string;
      folderId?: string | null;
      name?: string;
      projectId: string;
      sortOrder?: number;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { documentId, projectId, ...body } = input;
      const { data, error, response } = await apiClient.PATCH(
        '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}',
        {
          body,
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
            path: { documentId, organizationId, projectId },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Document could not be updated.');
      return data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useArchiveDocumentMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      archived: boolean;
      documentId: string;
      expectedUpdatedAt: string;
      projectId: string;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const options = {
        body: { expectedUpdatedAt: input.expectedUpdatedAt },
        params: {
          header: { 'X-CSRF-Token': currentUser.session.csrfToken },
          path: {
            documentId: input.documentId,
            organizationId,
            projectId: input.projectId,
          },
        },
      } as const;
      const result = input.archived
        ? await apiClient.POST(
            '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/archive',
            options,
          )
        : await apiClient.POST(
            '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/restore',
            options,
          );
      if (!result.response.ok || !result.data) {
        throw failure(
          result.error,
          'Document archive state could not be changed.',
        );
      }
      return result.data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useDeleteDocumentMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      expectedUpdatedAt: string;
      projectId: string;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { error, response } = await apiClient.DELETE(
        '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}',
        {
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
            path: {
              documentId: input.documentId,
              organizationId,
              projectId: input.projectId,
            },
            query: { expectedUpdatedAt: input.expectedUpdatedAt },
          },
        },
      );
      if (!response.ok) throw failure(error, 'Document could not be deleted.');
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useAddProjectMemberMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organizationMembershipId: string;
      projectId: string;
      role: ProjectRole;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { projectId, ...body } = input;
      const { data, error, response } = await apiClient.POST(
        '/v1/organizations/{organizationId}/projects/{projectId}/team',
        {
          body,
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
            path: { organizationId, projectId },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Project member could not be added.');
      return data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useChangeProjectMemberRoleMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      projectMembershipId: string;
      role: ProjectRole;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { data, error, response } = await apiClient.PATCH(
        '/v1/organizations/{organizationId}/projects/{projectId}/team/{projectMembershipId}',
        {
          body: { role: input.role },
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
            path: {
              organizationId,
              projectId: input.projectId,
              projectMembershipId: input.projectMembershipId,
            },
          },
        },
      );
      if (!response.ok || !data)
        throw failure(error, 'Project role could not be changed.');
      return data;
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
  });
}

export function useRemoveProjectMemberMutation(currentUser: CurrentUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      projectMembershipId: string;
    }) => {
      const organizationId = activeOrganizationId(currentUser);
      const { error, response } = await apiClient.DELETE(
        '/v1/organizations/{organizationId}/projects/{projectId}/team/{projectMembershipId}',
        {
          params: {
            header: { 'X-CSRF-Token': currentUser.session.csrfToken },
            path: {
              organizationId,
              projectId: input.projectId,
              projectMembershipId: input.projectMembershipId,
            },
          },
        },
      );
      if (!response.ok)
        throw failure(error, 'Project member could not be removed.');
    },
    onSuccess: async () => {
      await invalidateProjectQueries(
        queryClient,
        activeOrganizationId(currentUser),
      );
    },
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
    mutationFn: async (input: {
      email: string;
      projectId?: string;
      projectRole?: ProjectRole;
      role: OrganizationRole;
    }) => {
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
