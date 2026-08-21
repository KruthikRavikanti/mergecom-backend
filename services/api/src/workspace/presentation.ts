import type { SearchResourceType, WorkItemType, WorkSection } from './types';

export function workItemPresentation(input: {
  documentId: string;
  itemType: WorkItemType;
  projectId: string;
  resourceId: string;
}): { actionLabel: string; destination: string; section: WorkSection } {
  const history = `/app/projects/${input.projectId}/documents/${input.documentId}/history`;
  switch (input.itemType) {
    case 'assigned_review':
    case 'changes_requested':
    case 'awaiting_decisions':
      return {
        actionLabel:
          input.itemType === 'assigned_review'
            ? 'Review changes'
            : input.itemType === 'changes_requested'
              ? 'Address feedback'
              : 'View review',
        destination: `${history}/reviews/${input.resourceId}`,
        section: 'attention',
      };
    case 'version_exception':
    case 'incoming_conflict':
      return {
        actionLabel:
          input.itemType === 'incoming_conflict'
            ? 'Resolve conflict'
            : 'Inspect version',
        destination: `${history}?version=${input.resourceId}`,
        section: 'attention',
      };
    case 'comparison_exception':
    case 'recent_comparison':
      return {
        actionLabel:
          input.itemType === 'comparison_exception'
            ? 'Inspect comparison'
            : 'Review comparison',
        destination: `${history}/comparisons/${input.resourceId}`,
        section:
          input.itemType === 'comparison_exception' ? 'attention' : 'activity',
      };
    case 'approved_version':
      return {
        actionLabel: 'Open approval',
        destination: `${history}/reviews/${input.resourceId}`,
        section: 'activity',
      };
    case 'recent_document':
      return {
        actionLabel: 'Continue working',
        destination: history,
        section: 'continue',
      };
    case 'recent_version':
      return {
        actionLabel: 'View history',
        destination: `${history}?version=${input.resourceId}`,
        section: 'activity',
      };
  }
}

export function searchRank(name: string, query: string): number | null {
  const normalizedName = normalizeSearch(name);
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery || !normalizedName.includes(normalizedQuery))
    return null;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  return 2;
}

export function searchDestination(input: {
  documentId: string | null;
  id: string;
  projectId: string;
  resourceType: SearchResourceType;
}): string {
  if (input.resourceType === 'project') {
    return `/app/projects/${input.projectId}`;
  }
  if (input.resourceType === 'folder') {
    return `/app/projects/${input.projectId}/folders/${input.id}`;
  }
  return `/app/projects/${input.projectId}/documents/${input.documentId ?? input.id}/history`;
}

export function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}
