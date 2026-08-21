import {
  Check,
  CheckCircle2,
  CircleAlert,
  MessageSquarePlus,
  Send,
  X,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';

import {
  type ComparisonChange,
  type ComparisonVisualization,
  type ReviewRequest,
  useAddReviewCommentMutation,
  useCreateReviewThreadMutation,
  useRecordReviewDecisionMutation,
  useResolveReviewThreadMutation,
} from '../../../api/queries';
import type { CurrentUser } from '../../../auth/session';

export function ComparisonInspector({
  change,
  classification,
  comparisonId,
  documentId,
  onRequestReview,
  projectId,
  review,
  user,
  visualization,
}: {
  change?: ComparisonChange | undefined;
  classification?: { category: string; reasons: string[] } | undefined;
  comparisonId: string;
  documentId: string;
  onRequestReview: () => void;
  projectId: string;
  review?: ReviewRequest | undefined;
  user: CurrentUser;
  visualization?: ComparisonVisualization | undefined;
}) {
  const createThread = useCreateReviewThreadMutation(user);
  const addComment = useAddReviewCommentMutation(user);
  const resolveThread = useResolveReviewThreadMutation(user);
  const recordDecision = useRecordReviewDecisionMutation(user);
  const [error, setError] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const mapping = visualization?.mappings.find(
    (candidate) => candidate.changeId === change?.id,
  );
  const threads =
    review?.threads.filter(
      (thread) => thread.anchor?.changeId === change?.id,
    ) ?? [];

  async function startThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!change || !review) return;
    const form = event.currentTarget;
    const value = new FormData(form).get('body');
    const body = typeof value === 'string' ? value.trim() : '';
    if (!body) return;
    setError(null);
    try {
      await createThread.mutateAsync({
        anchor: {
          category: change.category,
          changeId: change.id,
          comparisonId,
          label: change.label,
          path: change.path,
        },
        body,
        documentId,
        projectId,
        reviewRequestId: review.id,
      });
      form.reset();
    } catch (submitError) {
      setError(message(submitError));
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>, threadId: string) {
    event.preventDefault();
    if (!review) return;
    const form = event.currentTarget;
    const value = new FormData(form).get('reply');
    const body = typeof value === 'string' ? value.trim() : '';
    if (!body) return;
    setError(null);
    try {
      await addComment.mutateAsync({
        body,
        documentId,
        projectId,
        reviewRequestId: review.id,
        threadId,
      });
      form.reset();
    } catch (submitError) {
      setError(message(submitError));
    }
  }

  async function decide(decision: 'approved' | 'changes_requested') {
    if (!review || !decisionNote.trim()) return;
    setError(null);
    try {
      await recordDecision.mutateAsync({
        decision,
        documentId,
        note: decisionNote.trim(),
        projectId,
        reviewRequestId: review.id,
      });
      setDecisionNote('');
    } catch (submitError) {
      setError(message(submitError));
    }
  }

  return (
    <aside
      className="comparison-inspector"
      data-tour="change-inspector"
      aria-label="Change inspector"
    >
      <div className="comparison-inspector-heading">
        <h2>Inspector</h2>
        {mapping ? (
          <span className={`mapping-${mapping.confidence}`}>
            {mapping.confidence === 'exact' ? (
              <CheckCircle2 aria-hidden="true" size={14} />
            ) : (
              <CircleAlert aria-hidden="true" size={14} />
            )}
            {mapping.confidence}
          </span>
        ) : null}
      </div>
      {change ? (
        <div className="comparison-inspector-scroll">
          <div className="inspector-change-summary">
            <div>
              <span className={`change-pill change-${change.changeType}`}>
                {change.changeType}
              </span>
              <span>{change.category}</span>
            </div>
            <h3>{change.label}</h3>
            <code>{change.path}</code>
            <p>{change.impact} impact</p>
            {classification ? (
              <div className="inspector-classification">
                <span>Deterministic classification</span>
                <strong>{classification.category}</strong>
                {classification.reasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </div>
            ) : null}
          </div>
          <div className="inspector-values">
            <ChangeValue label="Before" value={change.before} />
            <ChangeValue label="After" value={change.after} />
          </div>
          {mapping?.reason ? (
            <p className="inspector-mapping-note">{mapping.reason}</p>
          ) : null}

          <section className="inspector-review" data-tour="review-controls">
            <div className="inspector-section-heading">
              <h3>Review discussion</h3>
              <span>{threads.length}</span>
            </div>
            {!review ? (
              <button
                className="button-secondary w-full"
                type="button"
                onClick={onRequestReview}
              >
                <MessageSquarePlus aria-hidden="true" size={16} />
                Request review
              </button>
            ) : (
              <>
                {threads.map((thread) => (
                  <article className="inspector-thread" key={thread.id}>
                    <div>
                      <strong>{thread.createdBy.name}</strong>
                      <span>{thread.status}</span>
                    </div>
                    {thread.comments.map((comment) => (
                      <p key={comment.id}>
                        <b>{comment.author.name}</b>
                        {comment.body}
                      </p>
                    ))}
                    {thread.status === 'open' ? (
                      <>
                        <form
                          onSubmit={(event) => void reply(event, thread.id)}
                        >
                          <input
                            aria-label="Reply"
                            className="field"
                            maxLength={4000}
                            name="reply"
                            placeholder="Reply"
                            required
                          />
                          <button
                            aria-label="Send reply"
                            title="Send reply"
                            type="submit"
                          >
                            <Send aria-hidden="true" size={15} />
                          </button>
                        </form>
                        {thread.canResolve ? (
                          <button
                            className="inspector-resolve"
                            type="button"
                            onClick={() =>
                              void resolveThread.mutateAsync({
                                documentId,
                                projectId,
                                reviewRequestId: review.id,
                                threadId: thread.id,
                              })
                            }
                          >
                            <CheckCircle2 aria-hidden="true" size={14} />{' '}
                            Resolve
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </article>
                ))}
                {review.capabilities.canComment ? (
                  <form
                    className="inspector-new-thread"
                    onSubmit={(event) => void startThread(event)}
                  >
                    <textarea
                      aria-label="New discussion"
                      className="field"
                      maxLength={4000}
                      name="body"
                      placeholder="Comment on this change"
                      required
                      rows={3}
                    />
                    <button
                      className="button-primary"
                      disabled={createThread.isPending}
                      type="submit"
                    >
                      <MessageSquarePlus aria-hidden="true" size={15} /> Start
                      discussion
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </section>

          {review?.capabilities.canDecide ? (
            <section className="inspector-decision">
              <h3>Decision</h3>
              <textarea
                className="field"
                maxLength={2000}
                placeholder="Decision note"
                rows={2}
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
              />
              <div>
                <button
                  className="button-secondary"
                  disabled={!decisionNote.trim() || recordDecision.isPending}
                  type="button"
                  onClick={() => void decide('changes_requested')}
                >
                  <X aria-hidden="true" size={15} /> Changes
                </button>
                <button
                  className="button-primary inspector-approve"
                  disabled={!decisionNote.trim() || recordDecision.isPending}
                  type="button"
                  onClick={() => void decide('approved')}
                >
                  <Check aria-hidden="true" size={15} /> Approve
                </button>
              </div>
            </section>
          ) : null}
          {error ? (
            <p className="inspector-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="comparison-inspector-empty">
          <CircleAlert aria-hidden="true" size={20} />
          <p>Select a change to inspect its values and visual location.</p>
        </div>
      )}
    </aside>
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
    <div>
      <strong>{label}</strong>
      <pre>{value ?? 'None'}</pre>
    </div>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Review action failed.';
}
