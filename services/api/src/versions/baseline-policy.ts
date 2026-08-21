import type { BaselineCandidate, BaselineRecommendation } from './types';

export interface BaselinePolicyInput {
  approvedVersionId: string | null;
  candidates: BaselineCandidate[];
  target: BaselineCandidate;
  verifiedLocalBaseVersionId: string | null;
}

export function recommendComparisonBaseline(
  input: BaselinePolicyInput,
): BaselineRecommendation {
  const eligible = new Map(
    input.candidates
      .filter(
        (candidate) =>
          candidate.id !== input.target.id &&
          candidate.sequence < input.target.sequence &&
          candidate.processingState === 'completed' &&
          (candidate.status === 'ready' || candidate.status === 'conflicted'),
      )
      .map((candidate) => [candidate.id, candidate]),
  );
  const choices = [
    ['approved_version', input.approvedVersionId],
    ['verified_local_base', input.verifiedLocalBaseVersionId],
    ['previous_head', input.target.parentVersionId],
  ] as const;

  for (const [reason, versionId] of choices) {
    const version = versionId ? eligible.get(versionId) : undefined;
    if (version) return { baseline: version, reason };
  }
  return { baseline: null, reason: 'none' };
}
