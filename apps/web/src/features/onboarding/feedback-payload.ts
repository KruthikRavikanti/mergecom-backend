import type { FeedbackReason, FeedbackResourceType } from '../../api/queries';

export const PRODUCT_VERSION = '0.9.0-phase29';

export interface FeedbackPayloadInput {
  comment: string | null;
  rating: number;
  reason: FeedbackReason;
  resourceType: FeedbackResourceType;
  route: string;
}

export function buildFeedbackPayload(input: FeedbackPayloadInput) {
  return {
    comment: input.comment?.trim() || null,
    productVersion: PRODUCT_VERSION,
    rating: input.rating,
    reason: input.reason,
    resourceType: input.resourceType,
    route: input.route,
  };
}
