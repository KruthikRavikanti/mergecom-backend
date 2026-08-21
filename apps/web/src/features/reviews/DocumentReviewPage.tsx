import {
  Dialog,
  ErrorState,
  LoadingState,
  Toast,
  type ToastKind,
} from '@mergecom/ui';
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  GitCompareArrows,
  LoaderCircle,
  MessageSquarePlus,
  Send,
  X,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  type ComparisonChange,
  type ReviewRequest,
  useAddReviewCommentMutation,
  useCancelReviewMutation,
  useCreateReviewThreadMutation,
  useDocumentQuery,
  useProjectQuery,
  useRecordReviewDecisionMutation,
  useResolveReviewThreadMutation,
  useReviewQuery,
  useVersionComparisonQuery,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { readFormString } from '../../services/contact';

type DecisionValue = 'approved' | 'changes_requested';

const dateFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const statusLabels: Record<ReviewRequest['status'], string> = {
  approved: 'Approved',
  cancelled: 'Cancelled',
  changes_requested: 'Changes requested',
  open: 'Open',
  superseded: 'Superseded',
};
const statusClasses: Record<ReviewRequest['status'], string> = {
  approved: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-700',
  changes_requested: 'border-red-300 bg-red-50 text-red-800',
  open: 'border-sky-300 bg-sky-50 text-sky-900',
  superseded: 'border-amber-300 bg-amber-50 text-amber-900',
};

export function DocumentReviewPage() {
  const { documentId = '', projectId = '', reviewRequestId = '' } = useParams();
  const { user } = useAuth();
  const organizationId = user?.activeOrganization?.id;
  const project = useProjectQuery(organizationId, projectId);
  const document = useDocumentQuery(organizationId, projectId, documentId);
  const review = useReviewQuery(
    organizationId,
    projectId,
    documentId,
    reviewRequestId,
  );
  const comparison = useVersionComparisonQuery(
    organizationId,
    projectId,
    documentId,
    review.data?.comparisonId ?? '',
  );
  const recordDecision = useRecordReviewDecisionMutation(user!);
  const cancelReview = useCancelReviewMutation(user!);
  const createThread = useCreateReviewThreadMutation(user!);
  const addComment = useAddReviewCommentMutation(user!);
  const resolveThread = useResolveReviewThreadMutation(user!);
  const [decision, setDecision] = useState<DecisionValue | null>(null);
  const [anchorTarget, setAnchorTarget] = useState<ComparisonChange | null>(
    null,
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);

  if (!user || project.isLoading || document.isLoading || review.isLoading) {
    return <LoadingState label="Loading review" />;
  }
  if (
    project.isError ||
    document.isError ||
    review.isError ||
    comparison.isError
  ) {
    return (
      <ErrorState
        message="The review could not be loaded."
        onRetry={() => {
          void project.refetch();
          void document.refetch();
          void review.refetch();
          if (review.data?.comparisonId) void comparison.refetch();
        }}
      />
    );
  }
  if (!project.data || !document.data || !review.data) {
    return <ErrorState message="This review is unavailable." />;
  }

  const item = review.data;

  function report(error: unknown, fallback: string) {
    setToast({
      kind: 'error',
      message: error instanceof Error ? error.message : fallback,
    });
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    try {
      await recordDecision.mutateAsync({
        decision,
        documentId,
        note: readFormString(new FormData(event.currentTarget), 'note'),
        projectId,
        reviewRequestId,
      });
      setDecision(null);
      setToast({
        kind: 'success',
        message:
          decision === 'approved' ? 'Approval recorded.' : 'Changes requested.',
      });
    } catch (error) {
      report(error, 'Decision could not be recorded.');
    }
  }

  async function submitGeneralThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await createThread.mutateAsync({
        anchor: null,
        body: readFormString(new FormData(form), 'body'),
        documentId,
        projectId,
        reviewRequestId,
      });
      form.reset();
      setToast({ kind: 'success', message: 'Discussion started.' });
    } catch (error) {
      report(error, 'Discussion could not be started.');
    }
  }

  async function submitAnchoredThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!anchorTarget || !item.comparisonId) return;
    try {
      await createThread.mutateAsync({
        anchor: {
          category: anchorTarget.category,
          changeId: anchorTarget.id,
          comparisonId: item.comparisonId,
          label: anchorTarget.label,
          path: anchorTarget.path,
        },
        body: readFormString(new FormData(event.currentTarget), 'body'),
        documentId,
        projectId,
        reviewRequestId,
      });
      setAnchorTarget(null);
      setToast({ kind: 'success', message: 'Change discussion started.' });
    } catch (error) {
      report(error, 'Discussion could not be started.');
    }
  }

  async function reply(threadId: string, body: string) {
    try {
      await addComment.mutateAsync({
        body,
        documentId,
        projectId,
        reviewRequestId,
        threadId,
      });
      setToast({ kind: 'success', message: 'Reply added.' });
    } catch (error) {
      report(error, 'Reply could not be added.');
      throw error;
    }
  }

  async function resolve(threadId: string) {
    try {
      await resolveThread.mutateAsync({
        documentId,
        projectId,
        reviewRequestId,
        threadId,
      });
      setToast({ kind: 'success', message: 'Discussion resolved.' });
    } catch (error) {
      report(error, 'Discussion could not be resolved.');
    }
  }

  async function confirmCancel() {
    try {
      await cancelReview.mutateAsync({
        documentId,
        projectId,
        reviewRequestId,
      });
      setCancelOpen(false);
      setToast({ kind: 'success', message: 'Review cancelled.' });
    } catch (error) {
      report(error, 'Review could not be cancelled.');
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

      <div className="mt-5 flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-bold text-red-700">VERSION REVIEW</p>
            <span
              className={`rounded border px-2 py-0.5 text-xs font-bold ${statusClasses[item.status]}`}
            >
              {statusLabels[item.status]}
            </span>
          </div>
          <h1 className="page-title mt-1 break-words">
            Version {item.version.displayNumber}
          </h1>
          <p className="mt-2 break-words text-sm text-slate-700">
            {item.message}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {item.capabilities.canCancel ? (
            <button
              className="button-secondary"
              type="button"
              onClick={() => setCancelOpen(true)}
            >
              <Ban aria-hidden="true" size={17} />
              Cancel review
            </button>
          ) : null}
          {item.capabilities.canDecide ? (
            <>
              <button
                className="button-secondary border-red-300 text-red-800 hover:bg-red-50"
                type="button"
                onClick={() => setDecision('changes_requested')}
              >
                <X aria-hidden="true" size={17} />
                Request changes
              </button>
              <button
                className="button-primary bg-emerald-700 hover:bg-emerald-800"
                type="button"
                onClick={() => setDecision('approved')}
              >
                <Check aria-hidden="true" size={17} />
                Approve
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid border-b border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
        <ReviewFact
          label="Requested by"
          value={`${item.requestedBy.name} / ${dateFormatter.format(new Date(item.createdAt))}`}
        />
        <ReviewFact
          label="Version author"
          value={`${item.version.author.name} / ${dateFormatter.format(new Date(item.version.createdAt))}`}
        />
        <ReviewFact
          label="Reviewers"
          value={`${item.assignments.filter((assignment) => assignment.decision).length} of ${item.assignments.length} decided`}
        />
        <ReviewFact
          label="Approved version"
          value={
            item.approvedVersion
              ? `Version ${item.approvedVersion.displayNumber}`
              : 'None'
          }
        />
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">Decisions</h2>
            {item.closedAt ? (
              <span className="text-xs text-slate-500">
                Closed {dateFormatter.format(new Date(item.closedAt))}
              </span>
            ) : null}
          </div>
          <div className="mt-3 border-y border-slate-200 bg-white">
            {item.assignments.map((assignment) => (
              <div
                className="flex items-start gap-3 border-b border-slate-200 p-4 last:border-b-0"
                key={assignment.reviewer.id}
              >
                {assignment.decision?.decision === 'approved' ? (
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-emerald-700"
                    size={19}
                  />
                ) : assignment.decision?.decision === 'changes_requested' ? (
                  <X
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-red-700"
                    size={19}
                  />
                ) : (
                  <Clock3
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-slate-400"
                    size={19}
                  />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-slate-950">
                    {assignment.reviewer.name}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    {assignment.decision
                      ? assignment.decision.decision === 'approved'
                        ? 'Approved'
                        : 'Changes requested'
                      : assignment.projectRole
                        ? 'Awaiting decision'
                        : 'No longer an active reviewer'}
                  </p>
                  {assignment.decision ? (
                    <>
                      <p className="mt-2 break-words text-sm text-slate-700">
                        {assignment.decision.note}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {dateFormatter.format(
                          new Date(assignment.decision.createdAt),
                        )}
                      </p>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">Discussions</h2>
            {item.comparisonId ? (
              <Link
                className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline"
                to={`/app/projects/${projectId}/documents/${documentId}/history/comparisons/${item.comparisonId}`}
              >
                <GitCompareArrows aria-hidden="true" size={16} />
                View comparison
              </Link>
            ) : null}
          </div>

          {item.capabilities.canComment ? (
            <form
              className="mt-3 border-y border-slate-200 bg-slate-100 p-4"
              onSubmit={(event) => void submitGeneralThread(event)}
            >
              <label className="block text-sm font-semibold text-slate-800">
                New discussion
                <textarea
                  className="field mt-1 min-h-24 resize-y"
                  maxLength={2000}
                  name="body"
                  placeholder="Add a review comment"
                  required
                />
              </label>
              <div className="mt-3 flex justify-end">
                <button
                  className="button-primary"
                  disabled={createThread.isPending}
                  type="submit"
                >
                  {createThread.isPending ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin"
                      size={17}
                    />
                  ) : (
                    <MessageSquarePlus aria-hidden="true" size={17} />
                  )}
                  Start discussion
                </button>
              </div>
            </form>
          ) : null}

          {item.threads.length ? (
            <div className="mt-4 space-y-3">
              {item.threads.map((thread) => (
                <ReviewThread
                  canComment={item.capabilities.canComment}
                  key={thread.id}
                  pendingReply={addComment.isPending}
                  pendingResolve={resolveThread.isPending}
                  thread={thread}
                  onReply={reply}
                  onResolve={resolve}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 border-y border-dashed border-slate-300 py-6 text-center text-sm text-slate-600">
              No discussions yet.
            </div>
          )}
        </div>
      </div>

      {comparison.data?.state === 'completed' &&
      comparison.data.changes.length ? (
        <div className="mt-8 border-t border-slate-200 pt-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Comparison changes
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {comparison.data.changes.length} persisted changes
              </p>
            </div>
          </div>
          <div className="mt-3 border-y border-slate-200 bg-white">
            {comparison.data.changes.map((change) => {
              const discussionCount = item.threads.filter(
                (thread) => thread.anchor?.changeId === change.id,
              ).length;
              return (
                <div
                  className="grid gap-3 border-b border-slate-200 p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  key={change.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">
                        {change.category.toUpperCase()}
                      </span>
                      {discussionCount ? (
                        <span className="text-xs font-semibold text-red-700">
                          {discussionCount}{' '}
                          {discussionCount === 1 ? 'discussion' : 'discussions'}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 break-words font-bold text-slate-950">
                      {change.label}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {change.path}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      aria-label={`Open ${change.label} in comparison`}
                      className="button-secondary"
                      to={`/app/projects/${projectId}/documents/${documentId}/history/comparisons/${item.comparisonId}?change=${change.id}&mode=structured`}
                    >
                      <ArrowUpRight aria-hidden="true" size={17} />
                      Open
                    </Link>
                    {item.capabilities.canComment ? (
                      <button
                        aria-label={`Discuss ${change.label}`}
                        className="button-secondary"
                        type="button"
                        onClick={() => setAnchorTarget(change)}
                      >
                        <MessageSquarePlus aria-hidden="true" size={17} />
                        Discuss
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <Dialog
        description="The decision is permanent and remains attached to this version."
        onClose={() => setDecision(null)}
        open={Boolean(decision)}
        title={decision === 'approved' ? 'Approve version' : 'Request changes'}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void submitDecision(event)}
        >
          <label className="block text-sm font-semibold text-slate-800">
            Decision note
            <textarea
              className="field mt-1 min-h-28 resize-y"
              maxLength={2000}
              name="note"
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setDecision(null)}
            >
              Cancel
            </button>
            <button
              className="button-primary"
              disabled={recordDecision.isPending}
              type="submit"
            >
              {recordDecision.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  size={17}
                />
              ) : decision === 'approved' ? (
                <Check aria-hidden="true" size={17} />
              ) : (
                <X aria-hidden="true" size={17} />
              )}
              Record decision
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        {...(anchorTarget ? { description: anchorTarget.path } : {})}
        onClose={() => setAnchorTarget(null)}
        open={Boolean(anchorTarget)}
        title={
          anchorTarget ? `Discuss ${anchorTarget.label}` : 'Discuss change'
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void submitAnchoredThread(event)}
        >
          <label className="block text-sm font-semibold text-slate-800">
            Comment
            <textarea
              className="field mt-1 min-h-28 resize-y"
              maxLength={2000}
              name="body"
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setAnchorTarget(null)}
            >
              Cancel
            </button>
            <button
              className="button-primary"
              disabled={createThread.isPending}
              type="submit"
            >
              <MessageSquarePlus aria-hidden="true" size={17} />
              Start discussion
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        description="Assignments, decisions, and discussions remain in the audit history."
        onClose={() => setCancelOpen(false)}
        open={cancelOpen}
        title="Cancel review"
      >
        <div className="flex justify-end gap-2">
          <button
            className="button-secondary"
            type="button"
            onClick={() => setCancelOpen(false)}
          >
            Keep open
          </button>
          <button
            className="button-primary"
            disabled={cancelReview.isPending}
            type="button"
            onClick={() => void confirmCancel()}
          >
            <Ban aria-hidden="true" size={17} />
            Cancel review
          </button>
        </div>
      </Dialog>

      {toast ? <Toast kind={toast.kind} message={toast.message} /> : null}
    </section>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-slate-200 p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0">
      <p className="text-xs font-bold text-slate-500">{label.toUpperCase()}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function ReviewThread({
  canComment,
  onReply,
  onResolve,
  pendingReply,
  pendingResolve,
  thread,
}: {
  canComment: boolean;
  onReply: (threadId: string, body: string) => Promise<void>;
  onResolve: (threadId: string) => Promise<void>;
  pendingReply: boolean;
  pendingResolve: boolean;
  thread: ReviewRequest['threads'][number];
}) {
  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = readFormString(new FormData(form), 'body');
    try {
      await onReply(thread.id, body);
      form.reset();
    } catch {
      // The parent reports the mutation error.
    }
  }

  return (
    <article className="border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CircleDot
              aria-hidden="true"
              className={
                thread.status === 'open' ? 'text-sky-700' : 'text-emerald-700'
              }
              size={17}
            />
            <p className="font-bold text-slate-950">
              {thread.anchor?.label ?? 'General discussion'}
            </p>
            <span className="text-xs font-semibold text-slate-500">
              {thread.status === 'open' ? 'Open' : 'Resolved'}
            </span>
          </div>
          {thread.anchor ? (
            <p className="mt-1 break-all font-mono text-xs text-slate-500">
              {thread.anchor.path}
            </p>
          ) : null}
        </div>
        {thread.canResolve ? (
          <button
            aria-label="Resolve discussion"
            className="button-secondary"
            disabled={pendingResolve}
            title="Resolve discussion"
            type="button"
            onClick={() => void onResolve(thread.id)}
          >
            <CheckCircle2 aria-hidden="true" size={17} />
            Resolve
          </button>
        ) : null}
      </div>

      <div className="divide-y divide-slate-100">
        {thread.comments.map((comment) => (
          <div className="p-4" key={comment.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-slate-950">
                {comment.author.name}
              </p>
              <p className="text-xs text-slate-500">
                {dateFormatter.format(new Date(comment.createdAt))}
              </p>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
              {comment.body}
            </p>
          </div>
        ))}
      </div>

      {canComment && thread.status === 'open' ? (
        <form
          className="border-t border-slate-200 bg-slate-50 p-3"
          onSubmit={(event) => void submitReply(event)}
        >
          <label className="sr-only" htmlFor={`reply-${thread.id}`}>
            Reply
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              className="field min-h-20 flex-1 resize-y"
              id={`reply-${thread.id}`}
              maxLength={2000}
              name="body"
              placeholder="Reply"
              required
            />
            <button
              aria-label="Send reply"
              className="button-primary shrink-0"
              disabled={pendingReply}
              title="Send reply"
              type="submit"
            >
              <Send aria-hidden="true" size={17} />
              Reply
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}
