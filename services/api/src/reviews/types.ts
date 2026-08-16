import type { ProjectRole } from '../projects/types';

export type ReviewRequestStatus =
  'approved' | 'cancelled' | 'changes_requested' | 'open' | 'superseded';
export type ReviewDecisionValue = 'approved' | 'changes_requested';
export type ReviewAnchorCategory =
  'content' | 'feature' | 'structure' | 'validation';

export interface ReviewPerson {
  id: string;
  name: string;
}

export interface ReviewVersionReference {
  author: ReviewPerson;
  createdAt: Date;
  displayNumber: number;
  id: string;
  note: string;
}

export interface ReviewDecisionSummary {
  createdAt: Date;
  decision: ReviewDecisionValue;
  id: string;
  note: string;
}

export interface ReviewAssignmentSummary {
  decision: ReviewDecisionSummary | null;
  projectRole: ProjectRole | null;
  reviewer: ReviewPerson;
}

export interface ReviewCommentSummary {
  author: ReviewPerson;
  body: string;
  createdAt: Date;
  id: string;
}

export interface ReviewThreadAnchor {
  category: ReviewAnchorCategory;
  changeId: string;
  comparisonId: string;
  label: string;
  path: string;
}

export interface ReviewThreadSummary {
  anchor: ReviewThreadAnchor | null;
  canResolve: boolean;
  comments: ReviewCommentSummary[];
  createdAt: Date;
  createdBy: ReviewPerson;
  id: string;
  resolvedAt: Date | null;
  resolvedBy: ReviewPerson | null;
  status: 'open' | 'resolved';
  updatedAt: Date;
}

export interface ReviewCapabilities {
  canCancel: boolean;
  canComment: boolean;
  canDecide: boolean;
}

export interface ReviewRequestSummary {
  approvedVersion: Pick<ReviewVersionReference, 'displayNumber' | 'id'> | null;
  assignments: ReviewAssignmentSummary[];
  capabilities: ReviewCapabilities;
  closedAt: Date | null;
  comparisonId: string | null;
  createdAt: Date;
  id: string;
  message: string;
  requestedBy: ReviewPerson;
  status: ReviewRequestStatus;
  threads: ReviewThreadSummary[];
  updatedAt: Date;
  version: ReviewVersionReference;
}

export interface ReviewPage {
  items: ReviewRequestSummary[];
  nextCursor: string | null;
}
