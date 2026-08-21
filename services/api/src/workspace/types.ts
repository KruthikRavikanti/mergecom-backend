import type { ProjectActor } from '../projects/types';

export type WorkspaceActor = ProjectActor;
export type WorkSection = 'attention' | 'continue' | 'activity';
export type WorkItemType =
  | 'assigned_review'
  | 'changes_requested'
  | 'awaiting_decisions'
  | 'version_exception'
  | 'comparison_exception'
  | 'incoming_conflict'
  | 'recent_comparison'
  | 'approved_version'
  | 'recent_version'
  | 'recent_document';

export interface WorkItem {
  acknowledged: boolean;
  actionLabel: string;
  actor: { id: string; name: string } | null;
  destination: string;
  document: { id: string; name: string };
  itemType: WorkItemType;
  priority: number;
  project: { id: string; name: string };
  resourceId: string;
  section: WorkSection;
  status: string;
  updatedAt: Date;
}

export interface WorkPage {
  items: WorkItem[];
  nextCursor: string | null;
}

export type SearchResourceType = 'project' | 'folder' | 'document';

export interface WorkspaceSearchResult {
  breadcrumb: string;
  destination: string;
  id: string;
  name: string;
  resourceType: SearchResourceType;
  updatedAt: Date;
}

export interface RecentDocument {
  destination: string;
  document: { id: string; kind: string; name: string };
  openedAt: Date;
  project: { id: string; name: string };
}
