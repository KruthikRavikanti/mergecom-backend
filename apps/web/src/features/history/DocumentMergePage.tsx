import { ErrorState, LoadingState, Toast, type ToastKind } from '@mergecom/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileStack,
  GitMerge,
  LoaderCircle,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  type DocumentMerge,
  queryKeys,
  useDocumentMergeQuery,
  useDocumentQuery,
  useDownloadMergeCandidateMutation,
  useDownloadVersionMutation,
  useProjectQuery,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';

const dateFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const byteFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  notation: 'compact',
  style: 'unit',
  unit: 'byte',
  unitDisplay: 'narrow',
});
const failureLabels: Record<string, string> = {
  branch_head_changed: 'The latest team version changed before publication.',
  merge_candidate_path_missing: 'A changed paragraph could not be located.',
  merge_candidate_validation_failed: 'The generated package did not validate.',
  merge_candidate_verification_failed:
    'The generated package did not match the expected combined changes.',
  merge_change_shape_unsupported: 'The edits require manual Office resolution.',
  merge_changes_overlap: 'Both versions changed the same content.',
  merge_coverage_incomplete:
    'An input contains content outside merge coverage.',
  merge_format_requires_manual_resolution:
    'Divergent changes in this Office format require manual resolution.',
  merge_quota_exceeded:
    'Publishing the result would exceed the workspace storage quota.',
  merge_source_rejected: 'An input package could not be inspected safely.',
  merge_supporting_parts_changed:
    'A supporting package part changed outside automatic merge coverage.',
  merge_word_markup_unsupported:
    'A changed paragraph also changed unsupported markup.',
};
const strategyLabels: Record<string, string> = {
  disjoint_word_text: 'validated disjoint Word text',
  fast_forward_theirs: 'latest-unchanged fast-forward',
  identical_heads: 'identical source versions',
  retain_ours: 'conflicting-side unchanged',
};

export function DocumentMergePage() {
  const { documentId = '', mergeId = '', projectId = '' } = useParams();
  const { user } = useAuth();
  const organizationId = user?.activeOrganization?.id;
  const queryClient = useQueryClient();
  const project = useProjectQuery(organizationId, projectId);
  const document = useDocumentQuery(organizationId, projectId, documentId);
  const merge = useDocumentMergeQuery(
    organizationId,
    projectId,
    documentId,
    mergeId,
  );
  const downloadVersion = useDownloadVersionMutation(user!);
  const downloadCandidate = useDownloadMergeCandidateMutation(user!);
  const [toast, setToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!organizationId || !merge.data?.resultVersionId) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.versions(organizationId, projectId, documentId),
    });
  }, [
    documentId,
    merge.data?.resultVersionId,
    organizationId,
    projectId,
    queryClient,
  ]);

  if (!user || project.isLoading || document.isLoading || merge.isLoading) {
    return <LoadingState label="Loading merge" />;
  }
  if (project.isError || document.isError || merge.isError) {
    return (
      <ErrorState
        message="The merge operation could not be loaded."
        onRetry={() => {
          void project.refetch();
          void document.refetch();
          void merge.refetch();
        }}
      />
    );
  }
  if (!project.data || !document.data || !merge.data) {
    return <ErrorState message="This merge operation is unavailable." />;
  }

  const result = merge.data;
  const pending = ['queued', 'retryable_failed', 'running'].includes(
    result.state,
  );

  function report(error: unknown, fallback: string) {
    setToast({
      kind: 'error',
      message: error instanceof Error ? error.message : fallback,
    });
  }

  async function downloadSource(versionId: string) {
    try {
      await downloadVersion.mutateAsync({ documentId, projectId, versionId });
    } catch (error) {
      report(error, 'Source download could not be started.');
    }
  }

  async function downloadRetainedCandidate() {
    try {
      await downloadCandidate.mutateAsync({ documentId, mergeId, projectId });
    } catch (error) {
      report(error, 'Candidate download could not be started.');
    }
  }

  return (
    <section>
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline"
        to={`/app/projects/${projectId}/documents/${documentId}/history`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        {document.data.name}
      </Link>

      <div className="mt-5 border-b border-slate-200 pb-6">
        <p className="text-sm font-bold text-red-700">THREE-WAY MERGE</p>
        <h1 className="page-title mt-1 break-words">
          Version {result.theirsVersion.displayNumber} into version{' '}
          {result.oursVersion.displayNumber}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{project.data.name}</p>
      </div>

      <div className="grid border-b border-slate-200 bg-white lg:grid-cols-3">
        <VersionReference label="Common base" version={result.baseVersion} />
        <VersionReference
          label="Latest team version"
          version={result.oursVersion}
        />
        <VersionReference
          label="Retained conflicting version"
          version={result.theirsVersion}
        />
      </div>

      {pending ? <PendingMerge merge={result} /> : null}

      {result.state === 'completed' ? (
        <div className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-5 text-emerald-950">
          <div className="flex items-start gap-3">
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              size={20}
            />
            <div className="min-w-0">
              <p className="font-bold">Merged version created</p>
              <p className="mt-1 text-sm">
                {result.appliedPaths.length} conflicting-side{' '}
                {result.appliedPaths.length === 1 ? 'change' : 'changes'}{' '}
                applied using{' '}
                {strategyLabels[result.strategy ?? ''] ?? 'validated merge'}.
              </p>
              <Link
                className="button-primary mt-4"
                to={`/app/projects/${projectId}/documents/${documentId}/history`}
              >
                <FileStack aria-hidden="true" size={17} />
                View merged version
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {result.state === 'manual_resolution_required' ? (
        <div className="mt-6 border-l-4 border-amber-500 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              size={20}
            />
            <div className="min-w-0">
              <p className="font-bold">Manual resolution required</p>
              <p className="mt-1 text-sm">
                {failureLabels[result.failureCode ?? ''] ??
                  'The operation stopped without publishing a merged version.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => void downloadSource(result.oursVersion.id)}
                >
                  <Download aria-hidden="true" size={17} />
                  Download latest
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => void downloadSource(result.theirsVersion.id)}
                >
                  <Download aria-hidden="true" size={17} />
                  Download conflicting
                </button>
                {result.candidate ? (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => void downloadRetainedCandidate()}
                  >
                    <Download aria-hidden="true" size={17} />
                    Download candidate
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {result.state === 'permanently_failed' ? (
        <div className="mt-6 flex items-start gap-3 border-l-4 border-red-600 bg-red-50 p-5 text-red-950">
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={20}
          />
          <div>
            <p className="font-bold">Merge processing failed</p>
            <p className="mt-1 break-all font-mono text-xs">
              {result.failureCode ?? result.supportTraceId}
            </p>
          </div>
        </div>
      ) : null}

      {!pending ? (
        <div className="mt-7 grid border-y border-slate-200 bg-white sm:grid-cols-3">
          <ResultFact label="Outcome" value={stateLabel(result.state)} />
          <ResultFact
            label="Candidate"
            value={
              result.candidate
                ? `${byteFormatter.format(result.candidate.byteSize)} / ${result.candidate.sha256.slice(0, 12)}...`
                : 'Not generated'
            }
          />
          <ResultFact
            label="Completed"
            value={dateFormatter.format(new Date(result.updatedAt))}
          />
        </div>
      ) : null}

      {result.warnings.length ? (
        <div className="mt-5 border-l-2 border-amber-400 pl-4 text-sm text-amber-950">
          {result.warnings.map((warning) => (
            <p className="mt-1 first:mt-0" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-4 font-mono text-xs text-slate-500">
        <span>Merge schema {result.mergeSchemaVersion}</span>
        <span>Parser {result.parserVersion}</span>
        <span>Engine {result.engineVersion}</span>
        <span>Support {result.supportTraceId}</span>
        {result.stableHash ? (
          <span>Result {result.stableHash.slice(0, 16)}...</span>
        ) : null}
      </div>

      {toast ? <Toast kind={toast.kind} message={toast.message} /> : null}
    </section>
  );
}

function PendingMerge({ merge }: { merge: DocumentMerge }) {
  return (
    <div
      className="mt-6 flex items-start gap-3 border-l-4 border-sky-600 bg-sky-50 p-5 text-sky-950"
      role="status"
    >
      {merge.state === 'running' ? (
        <LoaderCircle
          aria-hidden="true"
          className="mt-0.5 shrink-0 animate-spin"
          size={20}
        />
      ) : (
        <GitMerge aria-hidden="true" className="mt-0.5 shrink-0" size={20} />
      )}
      <div>
        <p className="font-bold">
          {merge.state === 'running'
            ? 'Validating disjoint changes'
            : merge.state === 'retryable_failed'
              ? 'Merge retry scheduled'
              : 'Merge queued'}
        </p>
        <p className="mt-1 text-sm">
          Attempt {merge.attempts} of {merge.maxAttempts}
          {merge.nextAttemptAt
            ? ` / ${dateFormatter.format(new Date(merge.nextAttemptAt))}`
            : ''}
        </p>
      </div>
    </div>
  );
}

function VersionReference({
  label,
  version,
}: {
  label: string;
  version: DocumentMerge['baseVersion'];
}) {
  return (
    <div className="min-w-0 border-b border-slate-200 px-4 py-4 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <p className="text-xs font-bold text-slate-500">{label.toUpperCase()}</p>
      <p className="mt-1 font-bold text-slate-950">
        Version {version.displayNumber}
      </p>
      <p className="mt-1 break-words text-sm text-slate-700">{version.note}</p>
      <p className="mt-2 text-xs text-slate-500">
        {version.authorName} /{' '}
        {dateFormatter.format(new Date(version.createdAt))}
      </p>
      <p className="mt-1 font-mono text-xs text-slate-500">
        {version.artifactSha256.slice(0, 16)}...
      </p>
    </div>
  );
}

function ResultFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-200 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs font-bold text-slate-500">{label.toUpperCase()}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function stateLabel(state: DocumentMerge['state']): string {
  return state
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}
