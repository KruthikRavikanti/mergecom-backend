import { Dialog } from '@mergecom/ui';
import { CheckCircle2, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import {
  type FeedbackReason,
  type FeedbackResourceType,
  useSubmitProductFeedbackMutation,
} from '../../api/queries';
import type { CurrentUser } from '../../auth/session';
import { buildFeedbackPayload } from './feedback-payload';

const reasons: Array<{ label: string; value: FeedbackReason }> = [
  { label: 'Something is confusing', value: 'confusing' },
  { label: 'A capability is missing', value: 'missing_capability' },
  { label: 'The experience is slow', value: 'performance' },
  { label: 'A result looks incorrect', value: 'incorrect_result' },
  { label: 'This worked well', value: 'positive' },
  { label: 'Other', value: 'other' },
];

export function FeedbackDialog({
  onClose,
  open,
  resourceType,
  route,
  user,
}: {
  onClose: () => void;
  open: boolean;
  resourceType: FeedbackResourceType;
  route: string;
  user: CurrentUser;
}) {
  const submitFeedback = useSubmitProductFeedbackMutation(user);
  const [rating, setRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  function close() {
    setSubmitted(false);
    setRating(0);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) return;
    const form = new FormData(event.currentTarget);
    const reason = form.get('reason');
    const comment = form.get('comment');
    if (typeof reason !== 'string') return;
    try {
      await submitFeedback.mutateAsync(
        buildFeedbackPayload({
          comment:
            typeof comment === 'string' && comment.trim()
              ? comment.trim()
              : null,
          rating,
          reason: reason as FeedbackReason,
          resourceType,
          route,
        }),
      );
      setSubmitted(true);
    } catch {
      // The mutation state renders the user-facing error.
    }
  }

  return (
    <Dialog
      description="Send product feedback without attaching document content."
      onClose={close}
      open={open}
      title="Product feedback"
    >
      {submitted ? (
        <div className="py-4 text-center" role="status">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto text-emerald-700"
            size={28}
          />
          <p className="mt-3 font-semibold text-slate-900">
            Feedback submitted
          </p>
          <button
            className="button-secondary mt-4"
            type="button"
            onClick={close}
          >
            Close
          </button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">
              Overall rating
            </legend>
            <div
              aria-label="Overall rating"
              className="mt-2 grid grid-cols-5 border border-slate-300 bg-white p-1"
              role="radiogroup"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  aria-checked={rating === value}
                  className={`min-h-9 text-sm font-bold ${rating === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  key={value}
                  role="radio"
                  type="button"
                  onClick={() => setRating(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-semibold text-slate-800">
            Reason
            <select
              className="field mt-1"
              defaultValue="confusing"
              name="reason"
            >
              {reasons.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Comment <span className="font-normal text-slate-500">Optional</span>
            <textarea
              className="field mt-1"
              maxLength={2000}
              name="comment"
              rows={4}
            />
          </label>
          <div className="border-l-4 border-slate-400 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            Sent: rating, reason, your comment, page route, page category, and
            product version. Not sent: document names or content, change values,
            comments, files, or screenshots.
          </div>
          {submitFeedback.error ? (
            <p className="text-sm text-red-700" role="alert">
              {submitFeedback.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button className="button-secondary" type="button" onClick={close}>
              Cancel
            </button>
            <button
              className="button-primary"
              disabled={!rating || submitFeedback.isPending}
              type="submit"
            >
              <Send aria-hidden="true" size={16} />
              Submit
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
