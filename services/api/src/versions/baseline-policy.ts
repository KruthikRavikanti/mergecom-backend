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
  const approvedVersion =
    input.candidates.find(
      (candidate) => candidate.id === input.approvedVersionId,
    ) ?? null;
  const approvedState = !approvedVersion
    ? ('unavailable' as const)
    : approvedVersion.sequence < input.target.sequence
      ? ('older' as const)
      : approvedVersion.sequence === input.target.sequence
        ? ('equal' as const)
        : ('newer' as const);
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
    if (version) {
      return { approvedState, approvedVersion, baseline: version, reason };
    }
  }
  return {
    approvedState,
    approvedVersion,
    baseline: null,
    reason: 'none',
  };
}
