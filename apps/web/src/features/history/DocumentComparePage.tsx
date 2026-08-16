import { ErrorState, LoadingState } from '@mergecom/ui';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  EqualNot,
  FileDiff,
  LoaderCircle,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  type ComparisonChange,
  useDocumentQuery,
  useProjectQuery,
  useVersionComparisonQuery,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';

type ChangeFilter = 'all' | ComparisonChange['category'];

const dateFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const filters: Array<{ label: string; value: ChangeFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Content', value: 'content' },
  { label: 'Structure', value: 'structure' },
  { label: 'Features', value: 'feature' },
  { label: 'Validation', value: 'validation' },
];
const changeTypeClasses: Record<ComparisonChange['changeType'], string> = {
  added: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  modified: 'border-amber-300 bg-amber-50 text-amber-900',
  moved: 'border-sky-300 bg-sky-50 text-sky-900',
  removed: 'border-red-300 bg-red-50 text-red-800',
};
const impactClasses: Record<ComparisonChange['impact'], string> = {
  high: 'text-red-700',
  low: 'text-slate-600',
  medium: 'text-amber-800',
};

export function DocumentComparePage() {
  const { comparisonId = '', documentId = '', projectId = '' } = useParams();
  const { user } = useAuth();
  const organizationId = user?.activeOrganization?.id;
  const project = useProjectQuery(organizationId, projectId);
  const document = useDocumentQuery(organizationId, projectId, documentId);
  const comparison = useVersionComparisonQuery(
    organizationId,
    projectId,
    documentId,
    comparisonId,
  );
  const [filter, setFilter] = useState<ChangeFilter>('all');

  if (
    !user ||
    project.isLoading ||
    document.isLoading ||
    comparison.isLoading
  ) {
    return <LoadingState label="Loading comparison" />;
  }
  if (project.isError || document.isError || comparison.isError) {
    return (
      <ErrorState
        message="The version comparison could not be loaded."
        onRetry={() => {
          void project.refetch();
          void document.refetch();
          void comparison.refetch();
        }}
      />
    );
  }
  if (!project.data || !document.data || !comparison.data) {
    return <ErrorState message="This comparison is unavailable." />;
  }

  const result = comparison.data;
  const visibleChanges = result.changes.filter(
    (change) => filter === 'all' || change.category === filter,
  );
  const pending = ['queued', 'retryable_failed', 'running'].includes(
    result.state,
  );
  const failed = ['permanently_failed', 'quarantined'].includes(result.state);

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
        <p className="text-sm font-bold text-red-700">VERSION COMPARISON</p>
        <h1 className="page-title mt-1 break-words">
          Version {result.baseVersion.displayNumber} to version{' '}
          {result.targetVersion.displayNumber}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{project.data.name}</p>
      </div>

      <div className="grid border-b border-slate-200 bg-white md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
        <VersionReference label="Base" version={result.baseVersion} />
        <div className="flex items-center justify-center border-y border-slate-200 px-4 py-2 text-slate-400 md:border-x md:border-y-0">
          <ArrowRight aria-hidden="true" size={20} />
        </div>
        <VersionReference label="Target" version={result.targetVersion} />
      </div>

      {pending ? (
        <div
          className="mt-6 flex items-start gap-3 border-l-4 border-sky-600 bg-sky-50 p-4 text-sky-950"
          role="status"
        >
          {result.state === 'running' ? (
            <LoaderCircle
              aria-hidden="true"
              className="mt-0.5 shrink-0 animate-spin"
              size={19}
            />
          ) : (
            <FileDiff
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              size={19}
            />
          )}
          <div>
            <p className="font-bold">
              {result.state === 'running'
                ? 'Comparing normalized Office content'
                : result.state === 'retryable_failed'
                  ? 'Comparison retry scheduled'
                  : 'Comparison queued'}
            </p>
            <p className="mt-1 text-sm">
              Attempt {result.attempts} of {result.maxAttempts}
              {result.nextAttemptAt
                ? ` / ${dateFormatter.format(new Date(result.nextAttemptAt))}`
                : ''}
            </p>
          </div>
        </div>
      ) : null}

      {failed ? (
        <div className="mt-6 flex items-start gap-3 border-l-4 border-red-600 bg-red-50 p-4 text-red-950">
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={19}
          />
          <div>
            <p className="font-bold">Comparison failed</p>
            <p className="mt-1 break-all font-mono text-xs">
              {result.failureCode ?? result.supportTraceId}
            </p>
          </div>
        </div>
      ) : null}

      {result.state === 'completed' ? (
        <>
          <div className="mt-6 grid border-y border-slate-200 bg-white sm:grid-cols-3">
            <ResultFact
              label="Semantic result"
              state={
                result.semanticEqual === true
                  ? 'equal'
                  : result.semanticEqual === false
                    ? 'different'
                    : 'unknown'
              }
              value={
                result.semanticEqual === true
                  ? 'Equivalent'
                  : result.semanticEqual === false
                    ? 'Changes detected'
                    : 'Inconclusive'
              }
            />
            <ResultFact
              label="Source bytes"
              state={result.byteEqual ? 'equal' : 'different'}
              value={result.byteEqual ? 'Identical' : 'Different'}
            />
            <ResultFact
              label="Coverage"
              state={result.completeness === 'complete' ? 'equal' : 'unknown'}
              value={
                result.completeness === 'complete' ? 'Complete' : 'Partial'
              }
            />
          </div>

          {result.warnings.length ? (
            <div className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-950">
              <div className="flex items-center gap-2 font-bold">
                <CircleAlert aria-hidden="true" size={18} />
                Coverage warnings
              </div>
              {result.warnings.map((warning) => (
                <p className="mt-2 break-words text-sm" key={warning}>
                  {warning}
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Typed changes
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {result.summary.total ?? result.changes.length} total /{' '}
                {result.summary.added ?? 0} added /{' '}
                {result.summary.modified ?? 0} modified /{' '}
                {result.summary.removed ?? 0} removed
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {result.stableHash?.slice(0, 16)}
            </span>
          </div>

          <div
            aria-label="Change category"
            className="mt-4 flex overflow-x-auto border-b border-slate-300"
            role="group"
          >
            {filters.map((item) => (
              <button
                aria-pressed={filter === item.value}
                className={`min-h-10 shrink-0 border-b-2 px-4 text-sm font-semibold ${filter === item.value ? 'border-red-700 text-red-800' : 'border-transparent text-slate-600 hover:text-slate-950'}`}
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
              >
                {item.label}
                {item.value === 'all'
                  ? ` (${result.changes.length})`
                  : ` (${result.summary[item.value] ?? 0})`}
              </button>
            ))}
          </div>

          {visibleChanges.length ? (
            <div className="mt-4 space-y-3">
              {visibleChanges.map((change) => (
                <ChangeRow change={change} key={change.id} />
              ))}
            </div>
          ) : (
            <div className="mt-4 border border-dashed border-slate-300 bg-white p-8 text-center">
              <CheckCircle2
                aria-hidden="true"
                className="mx-auto text-emerald-700"
                size={24}
              />
              <p className="mt-2 font-bold text-slate-950">
                No changes in this category
              </p>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function VersionReference({
  label,
  version,
}: {
  label: string;
  version: {
    artifactSha256: string;
    authorName: string;
    createdAt: string;
    displayNumber: number;
    note: string;
  };
}) {
  return (
    <div className="min-w-0 px-4 py-4">
      <p className="text-xs font-bold text-slate-500">{label.toUpperCase()}</p>
      <p className="mt-1 font-bold text-slate-950">
        Version {version.displayNumber}
      </p>
      <p className="mt-1 break-words text-sm text-slate-700">{version.note}</p>
      <p className="mt-2 text-xs text-slate-500">
        {version.authorName} /{' '}
        {dateFormatter.format(new Date(version.createdAt))}
      </p>
      <p className="mt-1 break-all font-mono text-xs text-slate-500">
        {version.artifactSha256.slice(0, 16)}
      </p>
    </div>
  );
}

function ResultFact({
  label,
  state,
  value,
}: {
  label: string;
  state: 'different' | 'equal' | 'unknown';
  value: string;
}) {
  const Icon =
    state === 'equal'
      ? CheckCircle2
      : state === 'different'
        ? EqualNot
        : CircleAlert;
  const color =
    state === 'equal'
      ? 'text-emerald-700'
      : state === 'different'
        ? 'text-red-700'
        : 'text-amber-700';
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <Icon aria-hidden="true" className={`shrink-0 ${color}`} size={22} />
      <div>
        <p className="text-xs font-bold text-slate-500">
          {label.toUpperCase()}
        </p>
        <p className="mt-0.5 font-bold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function ChangeRow({ change }: { change: ComparisonChange }) {
  return (
    <article className="border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 text-xs font-bold ${changeTypeClasses[change.changeType]}`}
            >
              {change.changeType}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {change.category}
            </span>
          </div>
          <h3 className="mt-2 break-words font-bold text-slate-950">
            {change.label}
          </h3>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            {change.path}
          </p>
        </div>
        <span className={`text-xs font-bold ${impactClasses[change.impact]}`}>
          {change.impact.toUpperCase()} IMPACT
        </span>
      </div>
      <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-2">
        <ChangeValue label="Before" value={change.before} />
        <ChangeValue label="After" value={change.after} />
      </div>
    </article>
  );
}

function ChangeValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0 border-l-2 border-slate-300 pl-3">
      <p className="text-xs font-bold text-slate-500">{label.toUpperCase()}</p>
      <pre className="mt-1 whitespace-pre-wrap break-all font-sans text-sm leading-6 text-slate-800">
        {value ?? 'None'}
      </pre>
    </div>
  );
}
