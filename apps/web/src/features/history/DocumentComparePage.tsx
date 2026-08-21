import { ErrorState, LoadingState } from '@mergecom/ui';
import {
  ArrowLeft,
  CircleHelp,
  ClipboardCheck,
  FileDiff,
  GitCompareArrows,
  LoaderCircle,
  MessageSquarePlus,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  useComparisonBaselineQuery,
  useCreateComparisonMutation,
  useDocumentQuery,
  useProjectQuery,
  useReviewsQuery,
  useVersionComparisonQuery,
  useVersionsQuery,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { ReviewRequestDialog } from '../reviews/ReviewRequestDialog';
import { VisualComparisonWorkspace } from './visual-comparison/VisualComparisonWorkspace';

const activeStates = ['queued', 'retryable_failed', 'running'];

export function DocumentComparePage() {
  const { comparisonId = '', documentId = '', projectId = '' } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const organizationId = user?.activeOrganization?.id;
  const project = useProjectQuery(organizationId, projectId);
  const document = useDocumentQuery(organizationId, projectId, documentId);
  const comparison = useVersionComparisonQuery(
    organizationId,
    projectId,
    documentId,
    comparisonId,
  );
  const baseline = useComparisonBaselineQuery(
    organizationId,
    projectId,
    documentId,
    comparison.data?.targetVersion.id ?? '',
    comparison.data?.state === 'completed',
  );
  const createComparison = useCreateComparisonMutation(user!);
  const versions = useVersionsQuery(organizationId, projectId, documentId);
  const reviews = useReviewsQuery(organizationId, projectId, documentId);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [approvedComparisonError, setApprovedComparisonError] = useState<
    string | null
  >(null);

  if (
    !user ||
    project.isLoading ||
    document.isLoading ||
    comparison.isLoading ||
    versions.isLoading ||
    reviews.isLoading
  ) {
    return <LoadingState label="Loading comparison" />;
  }
  if (
    project.isError ||
    document.isError ||
    comparison.isError ||
    versions.isError ||
    reviews.isError
  ) {
    return (
      <ErrorState
        message="The version comparison could not be loaded."
        onRetry={() => {
          void project.refetch();
          void document.refetch();
          void comparison.refetch();
          void versions.refetch();
          void reviews.refetch();
        }}
      />
    );
  }
  if (
    !project.data ||
    !document.data ||
    !comparison.data ||
    !versions.data ||
    !reviews.data
  ) {
    return <ErrorState message="This comparison is unavailable." />;
  }

  const result = comparison.data;
  const targetVersion = versions.data.items.find(
    (version) => version.id === result.targetVersion.id,
  );
  const openReview = reviews.data.items.find(
    (review) =>
      review.version.id === result.targetVersion.id && review.status === 'open',
  );
  const approvedVersionId = reviews.data.items.find(
    (review) => review.approvedVersion,
  )?.approvedVersion?.id;
  const approvedSequence =
    versions.data.items.find((version) => version.id === approvedVersionId)
      ?.sequence ?? 0;
  const canRequestReview =
    result.state === 'completed' &&
    targetVersion?.processing.state === 'completed' &&
    targetVersion.artifact.scanStatus === 'clean' &&
    targetVersion.status === 'ready' &&
    targetVersion.sequence > approvedSequence &&
    ['project_lead', 'contributor'].includes(project.data.accessRole);
  const canCompareWithApproved =
    baseline.data?.approvedState === 'older' &&
    baseline.data.approvedVersion?.id !== result.baseVersion.id;

  async function compareWithApproved() {
    const approvedVersion = baseline.data?.approvedVersion;
    if (!approvedVersion) return;
    setApprovedComparisonError(null);
    try {
      const approvedComparison = await createComparison.mutateAsync({
        baseVersionId: approvedVersion.id,
        documentId,
        projectId,
        targetVersionId: result.targetVersion.id,
      });
      await navigate(
        `/app/projects/${projectId}/documents/${documentId}/history/comparisons/${approvedComparison.id}${location.search}`,
      );
    } catch (error) {
      setApprovedComparisonError(
        error instanceof Error
          ? error.message
          : 'Comparison with the approved version could not be started.',
      );
    }
  }

  function openGuide() {
    const next = new URLSearchParams(location.search);
    next.set('tour', '1');
    void navigate({ search: next.toString() }, { replace: true });
  }

  return (
    <section className="comparison-page">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline"
        to={`/app/projects/${projectId}/documents/${documentId}/history`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        {document.data.name}
      </Link>
      <div className="comparison-page-header">
        <div>
          <p>VERSION COMPARISON</p>
          <h1>
            Version {result.baseVersion.displayNumber} to version{' '}
            {result.targetVersion.displayNumber}
          </h1>
          <span>{project.data.name}</span>
        </div>
        <div className="comparison-header-actions">
          {result.state === 'completed' ? (
            <button
              className="button-secondary"
              type="button"
              onClick={openGuide}
            >
              <CircleHelp aria-hidden="true" size={17} />
              Guide
            </button>
          ) : null}
          {canCompareWithApproved ? (
            <button
              className="button-secondary"
              disabled={createComparison.isPending}
              type="button"
              onClick={() => void compareWithApproved()}
            >
              {createComparison.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  size={17}
                />
              ) : (
                <GitCompareArrows aria-hidden="true" size={17} />
              )}
              Compare with approved
            </button>
          ) : null}
          {openReview ? (
            <Link
              className="button-secondary"
              to={`/app/projects/${projectId}/documents/${documentId}/history/reviews/${openReview.id}${result.changes[0] ? `?change=${result.changes[0].id}` : ''}`}
            >
              <ClipboardCheck aria-hidden="true" size={17} /> Open review
            </Link>
          ) : canRequestReview ? (
            <button
              className="button-primary"
              type="button"
              onClick={() => setReviewOpen(true)}
            >
              <MessageSquarePlus aria-hidden="true" size={17} /> Request review
            </button>
          ) : null}
        </div>
      </div>
      {approvedComparisonError ? (
        <div className="comparison-action-error" role="alert">
          <ShieldAlert aria-hidden="true" size={16} />
          {approvedComparisonError}
        </div>
      ) : null}
      <div className="comparison-version-strip">
        <VersionSummary label="Base" version={result.baseVersion} />
        <VersionSummary label="Target" version={result.targetVersion} />
        <div>
          <span>Semantic</span>
          <strong>
            {result.state === 'completed'
              ? result.semanticEqual
                ? 'Equivalent'
                : 'Changes detected'
              : result.state.replace(/_/gu, ' ')}
          </strong>
        </div>
      </div>

      {activeStates.includes(result.state) ? (
        <div className="comparison-process-state" role="status">
          {result.state === 'running' ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={20}
            />
          ) : (
            <FileDiff aria-hidden="true" size={20} />
          )}
          <div>
            <strong>
              {result.state === 'running'
                ? 'Comparing normalized Office content'
                : result.state === 'retryable_failed'
                  ? 'Comparison retry scheduled'
                  : 'Comparison queued'}
            </strong>
            <span>
              Attempt {result.attempts} of {result.maxAttempts}
            </span>
          </div>
        </div>
      ) : null}
      {['permanently_failed', 'quarantined'].includes(result.state) ? (
        <div className="comparison-process-state is-error" role="alert">
          <ShieldAlert aria-hidden="true" size={20} />
          <div>
            <strong>Comparison failed</strong>
            <code>{result.failureCode ?? result.supportTraceId}</code>
          </div>
        </div>
      ) : null}
      {result.state === 'completed' ? (
        <VisualComparisonWorkspace
          comparison={result}
          documentId={documentId}
          onRequestReview={() => setReviewOpen(true)}
          projectId={projectId}
          review={openReview}
          user={user}
        />
      ) : null}
      {reviewOpen && targetVersion ? (
        <ReviewRequestDialog
          comparisonId={result.id}
          documentId={documentId}
          onClose={() => setReviewOpen(false)}
          onCreated={(review) =>
            void navigate(
              `/app/projects/${projectId}/documents/${documentId}/history/reviews/${review.id}`,
            )
          }
          open
          projectId={projectId}
          user={user}
          version={{
            authorUserId: targetVersion.author.id,
            displayNumber: targetVersion.displayNumber,
            id: targetVersion.id,
          }}
        />
      ) : null}
    </section>
  );
}

function VersionSummary({
  label,
  version,
}: {
  label: string;
  version: {
    authorName: string;
    displayNumber: number;
    note: string;
  };
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>Version {version.displayNumber}</strong>
      <p>{version.note}</p>
      <small>{version.authorName}</small>
    </div>
  );
}
