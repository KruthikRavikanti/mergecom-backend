import type { OrganizationRole } from '../identity/types';

export type ProjectRole =
  'project_lead' | 'contributor' | 'reviewer' | 'viewer';

export type DocumentKind = 'presentation' | 'spreadsheet' | 'word_document';

export interface ProjectActor {
  organizationId: string;
  organizationRole: OrganizationRole;
  userId: string;
}

export interface ProjectSummary {
  accessRole: ProjectRole;
  archivedAt: Date | null;
  clientName: string | null;
  createdAt: Date;
  createdBy: string;
  documentCount: number;
  folderCount: number;
  id: string;
  name: string;
  updatedAt: Date;
}

export interface ProjectFolderSummary {
  id: string;
  name: string;
  parentFolderId: string | null;
  sortOrder: number;
  updatedAt: Date;
}

export interface DocumentSummary {
  archivedAt: Date | null;
  createdAt: Date;
  folderId: string | null;
  id: string;
  kind: DocumentKind;
  name: string;
  sortOrder: number;
  updatedAt: Date;
}

export interface ProjectTeamMember {
  addedAt: Date;
  email: string;
  id: string;
  name: string;
  organizationMembershipId: string;
  organizationRole: OrganizationRole;
  role: ProjectRole;
  userId: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface FolderPathItem {
  id: string;
  name: string;
}
