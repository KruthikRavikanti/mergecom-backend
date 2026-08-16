import type { ProjectActor } from '../projects/types';
import type {
  ReviewDecisionValue,
  ReviewPage,
  ReviewRequestSummary,
  ReviewThreadAnchor,
} from './types';

export type ReviewOperationErrorCode =
  | 'conflict'
  | 'decision_exists'
  | 'denied'
  | 'idempotency_conflict'
  | 'invalid_anchor'
  | 'invalid_cursor'
  | 'invalid_reviewers'
  | 'limit_reached'
  | 'not_found'
  | 'review_closed'
  | 'review_unavailable';

export class ReviewOperationError extends Error {
  public constructor(public readonly code: ReviewOperationErrorCode) {
    super(code);
  }
}

export interface ReviewStore {
  addComment(input: {
    actor: ProjectActor;
    body: string;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
    threadId: string;
  }): Promise<ReviewRequestSummary>;
  cancelReview(input: {
    actor: ProjectActor;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
  }): Promise<ReviewRequestSummary>;
  createReview(input: {
    actor: ProjectActor;
    comparisonId: string | null;
    documentId: string;
    idempotencyKey: string;
    message: string;
    projectId: string;
    requestId: string;
    reviewerUserIds: string[];
    versionId: string;
  }): Promise<{ replayed: boolean; review: ReviewRequestSummary }>;
  createThread(input: {
    actor: ProjectActor;
    anchor: ReviewThreadAnchor | null;
    body: string;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
  }): Promise<ReviewRequestSummary>;
  decide(input: {
    actor: ProjectActor;
    decision: ReviewDecisionValue;
    documentId: string;
    idempotencyKey: string;
    note: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
  }): Promise<ReviewRequestSummary>;
  getReview(input: {
    actor: ProjectActor;
    documentId: string;
    projectId: string;
    reviewRequestId: string;
  }): Promise<ReviewRequestSummary>;
  listReviews(input: {
    actor: ProjectActor;
    cursor?: string | undefined;
    documentId: string;
    limit: number;
    projectId: string;
  }): Promise<ReviewPage>;
  resolveThread(input: {
    actor: ProjectActor;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    reviewRequestId: string;
    threadId: string;
  }): Promise<ReviewRequestSummary>;
}
