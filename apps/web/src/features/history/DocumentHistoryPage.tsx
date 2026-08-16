import {
  Dialog,
  ErrorState,
  LoadingState,
  Toast,
  type ToastKind,
} from '@mergecom/ui';
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  ClipboardCheck,
  Download,
  FileText,
  GitCompareArrows,
  LoaderCircle,
  MessageSquarePlus,
  ShieldAlert,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  type DocumentKind,
  type DocumentVersion,
  type ReviewRequest,
  useCreateComparisonMutation,
  useDocumentQuery,
  useDownloadVersionMutation,
  useProjectQuery,
  usePushVersionMutation,
  useRestoreVersionMutation,
  useReviewsQuery,
  useVersionsQuery,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { ReviewRequestDialog } from '../reviews/ReviewRequestDialog';
import { readFormString } from '../../services/contact';

const kindLabels: Record<DocumentKind, string> = {
  presentation: 'Presentation',
  spreadsheet: 'Spreadsheet',
  word_document: 'Word document',
};
const acceptedFiles: Record<DocumentKind, string> = {
  presentation: '.pptx,.pptm',
  spreadsheet: '.xlsx,.xlsm',
  word_document: '.docx,.docm',
};
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
const statusLabels: Record<DocumentVersion['status'], string> = {
  conflicted: 'Conflicting',
  failed: 'Failed',
  pending_processing: 'Processing',
  quarantined: 'Quarantined',
  ready: 'Ready',
};
const statusClasses: Record<DocumentVersion['status'], string> = {
  conflicted: 'border-amber-300 bg-amber-50 text-amber-900',
  failed: 'border-red-300 bg-red-50 text-red-800',
  pending_processing: 'border-sky-300 bg-sky-50 text-sky-900',
  quarantined: 'border-red-300 bg-red-50 text-red-800',
  ready: 'border-emerald-300 bg-emerald-50 text-emerald-800',
};
const processingLabels: Record<DocumentVersion['processing']['state'], string> =
  {
    completed: 'Inspection complete',
    permanently_failed: 'Inspection failed',
    quarantined: 'Quarantined',
    queued: 'Queued',
    retryable_failed: 'Retry scheduled',
    running: 'Inspecting',
  };
const processingClasses: Record<
  DocumentVersion['processing']['state'],
  string
> = {
  completed: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  permanently_failed: 'border-red-300 bg-red-50 text-red-800',
  quarantined: 'border-red-300 bg-red-50 text-red-800',
  queued: 'border-sky-300 bg-sky-50 text-sky-900',
  retryable_failed: 'border-amber-300 bg-amber-50 text-amber-900',
  running: 'border-sky-300 bg-sky-50 text-sky-900',
};
const reviewStatusLabels: Record<ReviewRequest['status'], string> = {
  approved: 'Approved',
  cancelled: 'Cancelled',
  changes_requested: 'Changes requested',
  open: 'Open',
  superseded: 'Superseded',
};
const reviewStatusClasses: Record<ReviewRequest['status'], string> = {
  approved: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-700',
  changes_requested: 'border-red-300 bg-red-50 text-red-800',
  open: 'border-sky-300 bg-sky-50 text-sky-900',
  superseded: 'border-amber-300 bg-amber-50 text-amber-900',
};

type UploadStage =
  'conflict' | 'failed' | 'finalizing' | 'hashing' | 'idle' | 'uploading';

export function DocumentHistoryPage() {
  const { documentId = '', projectId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const organizationId = user?.activeOrganization?.id;
  const project = useProjectQuery(organizationId, projectId);
  const document = useDocumentQuery(organizationId, projectId, documentId);
  const versions = useVersionsQuery(organizationId, projectId, documentId);
  const reviews = useReviewsQuery(organizationId, projectId, documentId);
  const pushVersion = usePushVersionMutation(user!);
  const downloadVersion = useDownloadVersionMutation(user!);
  const restoreVersion = useRestoreVersionMutation(user!);
  const createComparison = useCreateComparisonMutation(user!);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [restoreTarget, setRestoreTarget] = useState<DocumentVersion | null>(
    null,
  );
  const [reviewTarget, setReviewTarget] = useState<DocumentVersion | null>(
    null,
  );
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [toast, setToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);

  if (
    !user ||
    project.isLoading ||
    document.isLoading ||
    versions.isLoading ||
    reviews.isLoading
  ) {
    return <LoadingState label="Loading document history" />;
  }
  if (
    project.isError ||
    document.isError ||
    versions.isError ||
    reviews.isError
  ) {
    return (
      <ErrorState
        message="The document history could not be loaded."
        onRetry={() => {
          void project.refetch();
          void document.refetch();
          void versions.refetch();
          void reviews.refetch();
        }}
      />
    );
  }
  if (!project.data || !document.data || !versions.data || !reviews.data) {
    return <ErrorState message="This document is unavailable." />;
  }

  const canWrite =
    project.data.accessRole === 'project_lead' ||
    project.data.accessRole === 'contributor';

  function report(error: unknown, fallback: string) {
    setToast({
      kind: 'error',
      message: error instanceof Error ? error.message : fallback,
    });
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) {
      setToast({ kind: 'error', message: 'Choose an Office file to upload.' });
      return;
    }
    const controller = new AbortController();
    uploadAbort.current = controller;
    setUploadPercent(0);
    setUploadStage('hashing');
    try {
      const result = await pushVersion.mutateAsync({
        baseVersionId: versions.data!.branch.headVersionId,
        documentId,
        file,
        note: readFormString(form, 'note'),
        onProgress: ({ loaded, total }) =>
          setUploadPercent(Math.min(100, Math.round((loaded / total) * 100))),
        onStage: setUploadStage,
        projectId,
        signal: controller.signal,
      });
      if (result.outcome === 'conflict') {
        setUploadStage('conflict');
        setToast({
          kind: 'error',
          message: `Version ${result.version.displayNumber} was preserved but conflicts with the latest team version.`,
        });
      } else {
        setUploadOpen(false);
        setUploadStage('idle');
        setToast({
          kind: 'success',
          message: `Version ${result.version.displayNumber} was uploaded for secure inspection.`,
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setUploadOpen(false);
        setUploadStage('idle');
        setToast({ kind: 'success', message: 'Upload cancelled.' });
      } else {
        setUploadStage('failed');
        report(error, 'Version upload failed.');
      }
    } finally {
      uploadAbort.current = null;
    }
  }

  async function download(versionId: string) {
    try {
      await downloadVersion.mutateAsync({ documentId, projectId, versionId });
    } catch (error) {
      report(error, 'Download could not be started.');
    }
  }

  async function submitRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restoreTarget || !versions.data?.branch.headVersionId) return;
    try {
      const restored = await restoreVersion.mutateAsync({
        documentId,
        expectedHeadVersionId: versions.data.branch.headVersionId,
        note: readFormString(new FormData(event.currentTarget), 'note'),
        projectId,
        versionId: restoreTarget.id,
      });
      setRestoreTarget(null);
      setToast({
        kind: 'success',
        message: `Version ${restoreTarget.displayNumber} was restored as version ${restored.displayNumber}.`,
      });
    } catch (error) {
      report(error, 'Version could not be restored.');
    }
  }

  async function compareSelected() {
    const selected = versions
      .data!.items.filter((version) => selectedVersionIds.includes(version.id))
      .sort((left, right) => left.displayNumber - right.displayNumber);
    if (selected.length !== 2) return;
    try {
      const comparison = await createComparison.mutateAsync({
        baseVersionId: selected[0]!.id,
        documentId,
        projectId,
        targetVersionId: selected[1]!.id,
      });
      await navigate(
        `/app/projects/${projectId}/documents/${documentId}/history/comparisons/${comparison.id}`,
      );
    } catch (error) {
      report(error, 'Comparison could not be started.');
    }
  }

  const selectedVersions = versions.data.items
    .filter((version) => selectedVersionIds.includes(version.id))
    .sort((left, right) => left.displayNumber - right.displayNumber);
  const eligibleVersionCount = versions.data.items.filter(
    (version) =>
      version.processing.state === 'completed' &&
      version.artifact.scanStatus === 'clean' &&
      (version.status === 'ready' || version.status === 'conflicted'),
  ).length;
  const approvedVersionId = reviews.data.items.find(
    (review) => review.approvedVersion,
  )?.approvedVersion?.id;
  const approvedSequence =
    versions.data.items.find((version) => version.id === approvedVersionId)
      ?.sequence ?? 0;

  const busy = ['hashing', 'uploading', 'finalizing'].includes(uploadStage);
  const uploadCanBeCancelled = ['hashing', 'uploading'].includes(uploadStage);
  const stageLabel =
    uploadStage === 'hashing'
      ? 'Verifying file integrity...'
      : uploadStage === 'uploading'
        ? `Uploading ${uploadPercent}%`
        : uploadStage === 'finalizing'
          ? 'Creating immutable version...'
          : uploadStage === 'conflict'
            ? 'Upload preserved with a conflict.'
            : uploadStage === 'failed'
              ? 'Upload failed. Review the error and retry.'
              : null;

  return (
    <section>
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline"
        to={`/app/projects/${projectId}`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        {project.data.name}
      </Link>
      <div className="mt-5 flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-red-700">DOCUMENT</p>
          <h1 className="page-title mt-1 break-words">{document.data.name}</h1>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2">
              <FileText aria-hidden="true" size={16} />
              {kindLabels[document.data.kind]}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 aria-hidden="true" size={16} />
              Updated {dateFormatter.format(new Date(document.data.updatedAt))}
            </span>
          </div>
        </div>
        {canWrite ? (
          <button
            className="button-primary shrink-0"
            type="button"
            onClick={() => {
              setUploadStage('idle');
              setUploadOpen(true);
            }}
          >
            <Upload aria-hidden="true" size={17} />
            Upload version
          </button>
        ) : null}
      </div>

      <div className="mt-7 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Reviews</h2>
          <p className="mt-1 text-sm text-slate-600">
            Decisions stay attached to the version reviewed.
          </p>
        </div>
        <span className="text-sm font-semibold text-slate-500">
          {reviews.data.items.length}
        </span>
      </div>

      {reviews.data.items.length ? (
        <div className="mt-4 border-y border-slate-200 bg-white">
          {reviews.data.items.map((review) => (
            <Link
              className="grid gap-3 border-b border-slate-200 p-4 transition last:border-b-0 hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={review.id}
              to={`/app/projects/${projectId}/documents/${documentId}/history/reviews/${review.id}`}
            >
              <span className="flex min-w-0 items-start gap-3">
                <ClipboardCheck
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-slate-500"
                  size={19}
                />
                <span className="min-w-0">
                  <span className="block font-bold text-slate-950">
                    Version {review.version.displayNumber}
                  </span>
                  <span className="mt-1 block break-words text-sm text-slate-700">
                    {review.message}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Requested by {review.requestedBy.name} /{' '}
                    {dateFormatter.format(new Date(review.createdAt))}
                  </span>
                </span>
              </span>
              <span
                className={`w-fit rounded border px-2 py-0.5 text-xs font-bold ${reviewStatusClasses[review.status]}`}
              >
                {reviewStatusLabels[review.status]}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4 border-y border-dashed border-slate-300 py-5 text-sm text-slate-600">
          No reviews have been requested.
        </div>
      )}

      <div className="mt-7 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Version history</h2>
          <p className="mt-1 text-sm text-slate-600">
            {versions.data.branch.name} branch
          </p>
        </div>
        <span className="text-sm font-semibold text-slate-500">
          {versions.data.items.length}{' '}
          {versions.data.items.length === 1 ? 'version' : 'versions'}
        </span>
      </div>

      {eligibleVersionCount >= 2 ? (
        <div className="mt-4 flex flex-col gap-3 border-y border-slate-200 bg-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold text-slate-700">
              Base{' '}
              <strong className="text-slate-950">
                {selectedVersions[0]
                  ? `Version ${selectedVersions[0].displayNumber}`
                  : 'Not selected'}
              </strong>
            </span>
            <span className="font-semibold text-slate-700">
              Target{' '}
              <strong className="text-slate-950">
                {selectedVersions[1]
                  ? `Version ${selectedVersions[1].displayNumber}`
                  : 'Not selected'}
              </strong>
            </span>
          </div>
          <button
            className="button-primary shrink-0"
            disabled={
              selectedVersions.length !== 2 || createComparison.isPending
            }
            type="button"
            onClick={() => void compareSelected()}
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
            Compare versions
          </button>
        </div>
      ) : null}

      {versions.data.items.length ? (
        <div className="mt-4 border border-slate-200 bg-white">
          {versions.data.items.map((version) => {
            const isHead = version.id === versions.data?.branch.headVersionId;
            const comparisonEligible =
              version.processing.state === 'completed' &&
              version.artifact.scanStatus === 'clean' &&
              (version.status === 'ready' || version.status === 'conflicted');
            const comparisonSelected = selectedVersionIds.includes(version.id);
            const reviewEligible =
              canWrite &&
              version.processing.state === 'completed' &&
              version.artifact.scanStatus === 'clean' &&
              version.status === 'ready' &&
              version.sequence > approvedSequence;
            const openReview = reviews.data.items.find(
              (review) =>
                review.version.id === version.id && review.status === 'open',
            );
            const isApproved = approvedVersionId === version.id;
            return (
              <article
                className="grid gap-4 border-b border-slate-200 p-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                key={version.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  {comparisonEligible ? (
                    <input
                      aria-label={`Select version ${version.displayNumber} for comparison`}
                      checked={comparisonSelected}
                      className="mt-1 size-4 shrink-0 accent-red-700"
                      disabled={
                        !comparisonSelected && selectedVersionIds.length >= 2
                      }
                      title="Select for comparison"
                      type="checkbox"
                      onChange={() =>
                        setSelectedVersionIds((current) =>
                          current.includes(version.id)
                            ? current.filter((id) => id !== version.id)
                            : [...current, version.id],
                        )
                      }
                    />
                  ) : null}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-950">
                        Version {version.displayNumber}
                      </h3>
                      {isHead ? (
                        <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                          Latest
                        </span>
                      ) : null}
                      {isApproved ? (
                        <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
                          Approved
                        </span>
                      ) : null}
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-bold ${statusClasses[version.status]}`}
                      >
                        {statusLabels[version.status]}
                      </span>
                      {version.processing.state !== 'completed' ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold ${processingClasses[version.processing.state]}`}
                        >
                          {version.processing.state === 'running' ? (
                            <LoaderCircle
                              aria-hidden="true"
                              className="animate-spin"
                              size={13}
                            />
                          ) : null}
                          {processingLabels[version.processing.state]}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 break-words text-sm font-medium text-slate-800">
                      {version.note}
                    </p>
                    {version.status === 'conflicted' ? (
                      <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-amber-800">
                        <AlertTriangle aria-hidden="true" size={16} />
                        Based on an older team version; the latest was not
                        changed.
                      </p>
                    ) : null}
                    {version.processing.state === 'queued' ? (
                      <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-sky-900">
                        <Clock3 aria-hidden="true" size={16} />
                        Waiting for secure inspection
                      </p>
                    ) : null}
                    {version.processing.state === 'running' ? (
                      <p className="mt-2 text-sm font-semibold text-sky-900">
                        Secure inspection attempt {version.processing.attempts}{' '}
                        of {version.processing.maxAttempts}
                      </p>
                    ) : null}
                    {version.processing.state === 'retryable_failed' ? (
                      <p className="mt-2 inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-900">
                        <Clock3 aria-hidden="true" size={16} />
                        Attempt {version.processing.attempts} failed. Automatic
                        retry
                        {version.processing.nextAttemptAt
                          ? ` ${dateFormatter.format(new Date(version.processing.nextAttemptAt))}`
                          : ' pending'}
                        .
                      </p>
                    ) : null}
                    {version.processing.state === 'permanently_failed' ||
                    version.processing.state === 'quarantined' ? (
                      <p className="mt-2 inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-red-800">
                        <ShieldAlert aria-hidden="true" size={16} />
                        {version.processing.state === 'quarantined'
                          ? 'This package was isolated and is unavailable for processing.'
                          : 'Secure inspection could not complete after bounded retries.'}
                        {version.processing.failureCode ? (
                          <span className="font-mono text-xs">
                            {version.processing.failureCode}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {version.processing.snapshot?.warnings.length ? (
                      <div className="mt-3 border-l-2 border-amber-400 pl-3">
                        {version.processing.snapshot.warnings.map((warning) => (
                          <p
                            className="mt-1 text-sm text-amber-900 first:mt-0"
                            key={`${warning.code}:${warning.part ?? ''}:${warning.message}`}
                          >
                            <span className="font-semibold">
                              {warning.message}
                            </span>
                            {warning.part ? (
                              <span className="ml-2 break-all font-mono text-xs text-amber-800">
                                {warning.part}
                              </span>
                            ) : null}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <span>{version.author.name}</span>
                      <span>
                        {dateFormatter.format(new Date(version.createdAt))}
                      </span>
                      <span>
                        {byteFormatter.format(version.artifact.byteSize)}
                      </span>
                      <span className="font-mono">
                        SHA-256 {version.artifact.sha256.slice(0, 12)}...
                      </span>
                      {version.processing.snapshot ? (
                        <span>
                          Parser {version.processing.snapshot.parserVersion} /
                          schema {version.processing.snapshot.schemaVersion}
                        </span>
                      ) : null}
                      {version.processing.snapshot ? (
                        <span className="font-mono">
                          Snapshot{' '}
                          {version.processing.snapshot.stableHash.slice(0, 12)}
                          ...
                        </span>
                      ) : null}
                      <span className="font-mono">
                        Support {version.processing.supportTraceId.slice(0, 12)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {openReview ? (
                    <Link
                      className="button-secondary"
                      to={`/app/projects/${projectId}/documents/${documentId}/history/reviews/${openReview.id}`}
                    >
                      <ClipboardCheck aria-hidden="true" size={17} />
                      Open review
                    </Link>
                  ) : reviewEligible ? (
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => setReviewTarget(version)}
                    >
                      <MessageSquarePlus aria-hidden="true" size={17} />
                      Request review
                    </button>
                  ) : null}
                  <button
                    aria-label={`Download version ${version.displayNumber}`}
                    className="button-secondary"
                    title="Download exact version"
                    type="button"
                    onClick={() => void download(version.id)}
                  >
                    <Download aria-hidden="true" size={17} />
                    Download
                  </button>
                  {canWrite && !isHead ? (
                    <button
                      aria-label={`Restore version ${version.displayNumber}`}
                      className="button-secondary"
                      title="Restore as a new version"
                      type="button"
                      onClick={() => setRestoreTarget(version)}
                    >
                      <RotateCcw aria-hidden="true" size={17} />
                      Restore
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-base font-bold text-slate-950">
            No versions yet
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Upload the first Office file to begin this document's immutable
            history.
          </p>
        </div>
      )}

      <Dialog
        description="The original Office package is retained exactly and checked against its SHA-256."
        onClose={() => {
          if (!busy) setUploadOpen(false);
        }}
        open={uploadOpen}
        title="Upload version"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void submitUpload(event)}
        >
          <label className="block text-sm font-semibold text-slate-800">
            Office file
            <input
              accept={acceptedFiles[document.data.kind]}
              className="field mt-1 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:font-semibold"
              disabled={busy}
              name="file"
              required
              type="file"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Version note
            <textarea
              className="field mt-1 min-h-24 resize-y"
              disabled={busy}
              maxLength={500}
              name="note"
              placeholder="Summarize this version"
              required
            />
          </label>
          {stageLabel ? (
            <div
              className={`border-l-4 p-3 text-sm ${uploadStage === 'conflict' ? 'border-amber-500 bg-amber-50 text-amber-950' : uploadStage === 'failed' ? 'border-red-600 bg-red-50 text-red-950' : 'border-sky-600 bg-sky-50 text-sky-950'}`}
              role="status"
            >
              <span className="inline-flex items-center gap-2 font-semibold">
                {busy ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    size={16}
                  />
                ) : null}
                {stageLabel}
              </span>
              {uploadStage === 'uploading' ? (
                <progress
                  aria-label="Upload progress"
                  className="mt-2 block h-2 w-full accent-red-700"
                  max={100}
                  value={uploadPercent}
                />
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              className="button-secondary"
              disabled={uploadStage === 'finalizing'}
              type="button"
              onClick={() => {
                if (uploadCanBeCancelled) uploadAbort.current?.abort();
                else setUploadOpen(false);
              }}
            >
              {uploadStage === 'finalizing'
                ? 'Finalizing...'
                : uploadCanBeCancelled
                  ? 'Cancel upload'
                  : 'Cancel'}
            </button>
            <button className="button-primary" disabled={busy} type="submit">
              <Upload aria-hidden="true" size={17} />
              Upload version
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        description={`Version ${restoreTarget?.displayNumber ?? ''} will become a new version. Existing history remains unchanged.`}
        onClose={() => setRestoreTarget(null)}
        open={Boolean(restoreTarget)}
        title="Restore as new version"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void submitRestore(event)}
        >
          <label className="block text-sm font-semibold text-slate-800">
            Restore note
            <textarea
              className="field mt-1 min-h-24 resize-y"
              defaultValue={
                restoreTarget
                  ? `Restore version ${restoreTarget.displayNumber}: ${restoreTarget.note}`
                  : ''
              }
              maxLength={500}
              name="note"
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setRestoreTarget(null)}
            >
              Cancel
            </button>
            <button
              className="button-primary"
              disabled={restoreVersion.isPending}
              type="submit"
            >
              <RotateCcw aria-hidden="true" size={17} />
              Restore version
            </button>
          </div>
        </form>
      </Dialog>
      {reviewTarget ? (
        <ReviewRequestDialog
          comparisonId={null}
          documentId={documentId}
          onClose={() => setReviewTarget(null)}
          onCreated={(review) =>
            void navigate(
              `/app/projects/${projectId}/documents/${documentId}/history/reviews/${review.id}`,
            )
          }
          open
          projectId={projectId}
          user={user}
          version={{
            authorUserId: reviewTarget.author.id,
            displayNumber: reviewTarget.displayNumber,
            id: reviewTarget.id,
          }}
        />
      ) : null}
      {toast ? <Toast kind={toast.kind} message={toast.message} /> : null}
    </section>
  );
}
