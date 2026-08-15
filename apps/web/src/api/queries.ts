import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { demoAdapter } from '../demo/adapter';
import type { DemoSettings } from '../demo/types';
import { apiClient } from './client';

export const queryKeys = {
  apiReadiness: ['api', 'readiness'] as const,
  members: ['demo', 'members'] as const,
  project: (projectId: string) => ['demo', 'projects', projectId] as const,
  projects: ['demo', 'projects'] as const,
  settings: ['demo', 'settings'] as const,
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

export function useMembersQuery() {
  return useQuery({
    queryFn: () => demoAdapter.getMembers(),
    queryKey: queryKeys.members,
  });
}

export function useSettingsQuery() {
  return useQuery({
    queryFn: () => demoAdapter.getSettings(),
    queryKey: queryKeys.settings,
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: DemoSettings) =>
      demoAdapter.updateSettings(settings),
    onSuccess: (settings) =>
      queryClient.setQueryData(queryKeys.settings, settings),
  });
}
