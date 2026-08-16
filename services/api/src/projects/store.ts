import type {
  CursorPage,
  DocumentKind,
  DocumentSummary,
  FolderPathItem,
  ProjectActor,
  ProjectFolderSummary,
  ProjectRole,
  ProjectSummary,
  ProjectTeamMember,
} from './types';

export type ProjectOperationErrorCode =
  | 'conflict'
  | 'denied'
  | 'idempotency_conflict'
  | 'invalid_cursor'
  | 'invalid_parent'
  | 'non_empty'
  | 'not_found'
  | 'role_exceeds_organization';

export class ProjectOperationError extends Error {
  public constructor(public readonly code: ProjectOperationErrorCode) {
    super(code);
  }
}

export interface PageInput {
  cursor?: string | undefined;
  limit: number;
}

export interface ProjectStore {
  addProjectMember(input: {
    actor: ProjectActor;
    organizationMembershipId: string;
    projectId: string;
    requestId: string;
    role: ProjectRole;
  }): Promise<ProjectTeamMember>;
  archiveDocument(input: {
    actor: ProjectActor;
    archived: boolean;
    documentId: string;
    expectedUpdatedAt: Date;
    projectId: string;
    requestId: string;
  }): Promise<DocumentSummary>;
  archiveProject(input: {
    actor: ProjectActor;
    archived: boolean;
    expectedUpdatedAt: Date;
    projectId: string;
    requestId: string;
  }): Promise<ProjectSummary>;
  changeProjectMemberRole(input: {
    actor: ProjectActor;
    projectId: string;
    projectMembershipId: string;
    requestId: string;
    role: ProjectRole;
  }): Promise<ProjectTeamMember>;
  createDocument(input: {
    actor: ProjectActor;
    folderId: string | null;
    idempotencyKey: string;
    kind: DocumentKind;
    name: string;
    projectId: string;
    requestId: string;
  }): Promise<DocumentSummary>;
  createFolder(input: {
    actor: ProjectActor;
    idempotencyKey: string;
    name: string;
    parentFolderId: string | null;
    projectId: string;
    requestId: string;
  }): Promise<ProjectFolderSummary>;
  createProject(input: {
    actor: ProjectActor;
    clientName: string | null;
    idempotencyKey: string;
    name: string;
    requestId: string;
  }): Promise<ProjectSummary>;
  deleteDocument(input: {
    actor: ProjectActor;
    documentId: string;
    expectedUpdatedAt: Date;
    projectId: string;
    requestId: string;
  }): Promise<void>;
  deleteFolder(input: {
    actor: ProjectActor;
    expectedUpdatedAt: Date;
    folderId: string;
    projectId: string;
    requestId: string;
  }): Promise<void>;
  deleteProject(input: {
    actor: ProjectActor;
    expectedUpdatedAt: Date;
    projectId: string;
    requestId: string;
  }): Promise<void>;
  getDocument(
    actor: ProjectActor,
    projectId: string,
    documentId: string,
  ): Promise<DocumentSummary>;
  getFolderPath(
    actor: ProjectActor,
    projectId: string,
    folderId: string | null,
  ): Promise<FolderPathItem[]>;
  getProject(actor: ProjectActor, projectId: string): Promise<ProjectSummary>;
  listDocuments(
    actor: ProjectActor,
    projectId: string,
    folderId: string | null,
    archived: boolean,
    page: PageInput,
  ): Promise<CursorPage<DocumentSummary>>;
  listFolders(
    actor: ProjectActor,
    projectId: string,
    parentFolderId: string | null,
    page: PageInput,
  ): Promise<CursorPage<ProjectFolderSummary>>;
  listProjectMembers(
    actor: ProjectActor,
    projectId: string,
    page: PageInput,
  ): Promise<CursorPage<ProjectTeamMember>>;
  listProjects(
    actor: ProjectActor,
    archived: boolean,
    page: PageInput,
  ): Promise<CursorPage<ProjectSummary>>;
  removeProjectMember(input: {
    actor: ProjectActor;
    projectId: string;
    projectMembershipId: string;
    requestId: string;
  }): Promise<void>;
  updateDocument(input: {
    actor: ProjectActor;
    documentId: string;
    expectedUpdatedAt: Date;
    folderId?: string | null | undefined;
    name?: string | undefined;
    projectId: string;
    requestId: string;
    sortOrder?: number | undefined;
  }): Promise<DocumentSummary>;
  updateFolder(input: {
    actor: ProjectActor;
    expectedUpdatedAt: Date;
    folderId: string;
    name?: string | undefined;
    parentFolderId?: string | null | undefined;
    projectId: string;
    requestId: string;
    sortOrder?: number | undefined;
  }): Promise<ProjectFolderSummary>;
  updateProject(input: {
    actor: ProjectActor;
    clientName?: string | null | undefined;
    expectedUpdatedAt: Date;
    name?: string | undefined;
    projectId: string;
    requestId: string;
  }): Promise<ProjectSummary>;
}
