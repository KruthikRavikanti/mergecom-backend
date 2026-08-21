import type { PageInput } from '../projects/store';
import type {
  RecentDocument,
  WorkPage,
  WorkSection,
  WorkspaceActor,
  WorkspaceSearchResult,
} from './types';

export type WorkspaceOperationErrorCode = 'invalid_cursor' | 'not_found';

export class WorkspaceOperationError extends Error {
  public constructor(public readonly code: WorkspaceOperationErrorCode) {
    super(code);
  }
}

export interface WorkspaceStore {
  listRecents(input: {
    actor: WorkspaceActor;
    limit: number;
  }): Promise<RecentDocument[]>;
  listWork(input: {
    actor: WorkspaceActor;
    page: PageInput;
    section: WorkSection | null;
  }): Promise<WorkPage>;
  recordRecent(input: {
    actor: WorkspaceActor;
    documentId: string;
    projectId: string;
  }): Promise<void>;
  search(input: {
    actor: WorkspaceActor;
    limit: number;
    query: string;
  }): Promise<WorkspaceSearchResult[]>;
}
