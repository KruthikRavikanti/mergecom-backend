import { Dialog } from '@mergecom/ui';
import { LoaderCircle, Send } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import {
  type ReviewRequest,
  useCreateReviewMutation,
  useProjectTeamQuery,
} from '../../api/queries';
import type { CurrentUser } from '../../auth/session';
import { readFormString } from '../../services/forms';

interface ReviewRequestDialogProps {
  comparisonId: string | null;
  documentId: string;
  onClose: () => void;
  onCreated: (review: ReviewRequest) => void;
  open: boolean;
  projectId: string;
  user: CurrentUser;
  version: {
    authorUserId: string;
    displayNumber: number;
    id: string;
  };
}

export function ReviewRequestDialog({
  comparisonId,
  documentId,
  onClose,
  onCreated,
  open,
  projectId,
  user,
  version,
}: ReviewRequestDialogProps) {
  const organizationId = user.activeOrganization?.id;
  const team = useProjectTeamQuery(organizationId, projectId);
  const createReview = useCreateReviewMutation(user);
  const [reviewerUserIds, setReviewerUserIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eligibleReviewers = useMemo(
    () =>
      team.data?.items.filter(
        (member) =>
          ['project_lead', 'reviewer'].includes(member.role) &&
          member.userId !== version.authorUserId,
      ) ?? [],
    [team.data, version.authorUserId],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewerUserIds.length) {
      setError('Select at least one reviewer.');
      return;
    }
    try {
      const review = await createReview.mutateAsync({
        comparisonId,
        documentId,
        message: readFormString(new FormData(event.currentTarget), 'message'),
        projectId,
        reviewerUserIds,
        versionId: version.id,
      });
      onCreated(review);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Review could not be requested.',
      );
    }
  }

  return (
    <Dialog
      description={`Assign reviewers to immutable version ${version.displayNumber}.`}
      onClose={() => {
        if (!createReview.isPending) onClose();
      }}
      open={open}
      title="Request review"
    >
      <form className="space-y-5" onSubmit={(event) => void submit(event)}>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-800">
            Reviewers ({reviewerUserIds.length}/20)
          </legend>
          {team.isLoading ? (
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                size={16}
              />
              Loading reviewers
            </p>
          ) : team.isError ? (
            <p className="mt-2 text-sm font-semibold text-red-700">
              Project reviewers could not be loaded.
            </p>
          ) : eligibleReviewers.length ? (
            <div className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
              {eligibleReviewers.map((member) => (
                <label
                  className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-sm"
                  key={member.id}
                >
                  <input
                    checked={reviewerUserIds.includes(member.userId)}
                    className="size-4 shrink-0 accent-red-700"
                    disabled={
                      !reviewerUserIds.includes(member.userId) &&
                      reviewerUserIds.length >= 20
                    }
                    type="checkbox"
                    onChange={() =>
                      setReviewerUserIds((current) =>
                        current.includes(member.userId)
                          ? current.filter((id) => id !== member.userId)
                          : [...current, member.userId],
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-semibold text-slate-950">
                      {member.name}
                    </span>
                    <span className="block break-all text-xs text-slate-500">
                      {member.email}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {member.role === 'project_lead'
                      ? 'Project lead'
                      : 'Reviewer'}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-2 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">
              No eligible reviewers are assigned to this project.
            </p>
          )}
        </fieldset>

        <label className="block text-sm font-semibold text-slate-800">
          Review message
          <textarea
            className="field mt-1 min-h-28 resize-y"
            maxLength={2000}
            name="message"
            placeholder="What should reviewers focus on?"
            required
          />
        </label>

        {error ? (
          <p className="border-l-4 border-red-600 bg-red-50 p-3 text-sm font-semibold text-red-900">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            className="button-secondary"
            disabled={createReview.isPending}
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button-primary"
            disabled={
              createReview.isPending ||
              team.isLoading ||
              !eligibleReviewers.length
            }
            type="submit"
          >
            {createReview.isPending ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                size={17}
              />
            ) : (
              <Send aria-hidden="true" size={17} />
            )}
            Request review
          </button>
        </div>
      </form>
    </Dialog>
  );
}
