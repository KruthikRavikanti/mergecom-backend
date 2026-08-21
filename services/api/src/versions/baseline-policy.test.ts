import { describe, expect, it } from 'vitest';

import { recommendComparisonBaseline } from './baseline-policy';
import type { BaselineCandidate } from './types';

function candidate(
  id: string,
  sequence: number,
  parentVersionId: string | null,
): BaselineCandidate {
  return {
    author: { id: `author-${id}`, name: `Author ${id}` },
    createdAt: new Date(`2026-01-0${sequence}T00:00:00.000Z`),
    displayNumber: sequence,
    id,
    parentVersionId,
    processingState: 'completed',
    sequence,
    status: 'ready',
  };
}

describe('recommendComparisonBaseline', () => {
  const v1 = candidate('v1', 1, null);
  const v2 = candidate('v2', 2, 'v1');
  const target = candidate('v3', 3, 'v2');

  it('prefers an approved version over local and parent versions', () => {
    expect(
      recommendComparisonBaseline({
        approvedVersionId: 'v1',
        candidates: [v1, v2],
        target,
        verifiedLocalBaseVersionId: 'v2',
      }),
    ).toEqual({ baseline: v1, reason: 'approved_version' });
  });

  it('falls back through verified local base and previous head', () => {
    expect(
      recommendComparisonBaseline({
        approvedVersionId: null,
        candidates: [v1, v2],
        target,
        verifiedLocalBaseVersionId: 'v1',
      }).reason,
    ).toBe('verified_local_base');
    expect(
      recommendComparisonBaseline({
        approvedVersionId: null,
        candidates: [v1, v2],
        target,
        verifiedLocalBaseVersionId: null,
      }).reason,
    ).toBe('previous_head');
  });

  it('rejects self, newer, and unprocessed candidates', () => {
    const queued = { ...v2, processingState: 'queued' as const };
    expect(
      recommendComparisonBaseline({
        approvedVersionId: target.id,
        candidates: [target, queued],
        target,
        verifiedLocalBaseVersionId: queued.id,
      }),
    ).toEqual({ baseline: null, reason: 'none' });
  });
});
