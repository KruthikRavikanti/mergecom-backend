import { describe, expect, it } from 'vitest';

import { buildFeedbackPayload } from './feedback-payload';

describe('feedback payload', () => {
  it('contains only the disclosed metadata and explicit comment', () => {
    const payload = buildFeedbackPayload({
      comment: '  The comparison took too long.  ',
      rating: 2,
      reason: 'performance',
      resourceType: 'comparison',
      route: '/app/projects/project-id/documents/document-id',
    });

    expect(payload).toEqual({
      comment: 'The comparison took too long.',
      productVersion: '0.9.0-phase29',
      rating: 2,
      reason: 'performance',
      resourceType: 'comparison',
      route: '/app/projects/project-id/documents/document-id',
    });
    expect(Object.keys(payload).sort()).toEqual([
      'comment',
      'productVersion',
      'rating',
      'reason',
      'resourceType',
      'route',
    ]);
  });
});
