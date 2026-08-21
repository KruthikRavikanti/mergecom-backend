import { Check, ChevronRight, Circle, ListChecks, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  useOnboardingQuery,
  useUpdateOnboardingPreferencesMutation,
} from '../../api/queries';
import type { CurrentUser } from '../../auth/session';

export function OnboardingChecklist({
  allowDismiss = true,
  user,
}: {
  allowDismiss?: boolean;
  user: CurrentUser;
}) {
  const onboarding = useOnboardingQuery(user.activeOrganization?.id);
  const updatePreferences = useUpdateOnboardingPreferencesMutation(user);

  if (onboarding.isLoading) {
    return (
      <div className="h-44 animate-pulse border border-slate-200 bg-white" />
    );
  }
  if (!onboarding.data) return null;
  if (allowDismiss && onboarding.data.dismissed) {
    return (
      <button
        className="button-secondary w-full justify-start"
        type="button"
        onClick={() => updatePreferences.mutate({ dismissed: false })}
      >
        <ListChecks aria-hidden="true" size={17} />
        Reopen getting started
      </button>
    );
  }
  const { progress, steps } = onboarding.data;
  const percent = progress.total
    ? Math.round((progress.completed / progress.total) * 100)
    : 100;

  return (
    <section
      className="border border-slate-300 bg-white"
      aria-labelledby="onboarding-checklist"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <p className="text-[10px] font-bold text-red-700">GETTING STARTED</p>
          <h2
            className="mt-1 text-sm font-bold text-slate-950"
            id="onboarding-checklist"
          >
            Core workflow
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {progress.completed} of {progress.total} complete
          </p>
        </div>
        {allowDismiss ? (
          <button
            aria-label="Dismiss getting started"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            title="Dismiss getting started"
            type="button"
            onClick={() => updatePreferences.mutate({ dismissed: true })}
          >
            <X aria-hidden="true" size={17} />
          </button>
        ) : null}
      </div>
      <div className="h-1 bg-slate-100" aria-hidden="true">
        <div className="h-full bg-red-700" style={{ width: `${percent}%` }} />
      </div>
      <ol className="divide-y divide-slate-100">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              className="grid grid-cols-[18px_minmax(0,1fr)_16px] items-start gap-2 px-4 py-3 hover:bg-slate-50"
              to={step.destination}
            >
              {step.completed ? (
                <span className="mt-0.5 grid h-4 w-4 place-items-center bg-emerald-700 text-white">
                  <Check aria-hidden="true" size={11} />
                </span>
              ) : (
                <Circle
                  aria-hidden="true"
                  className="mt-0.5 text-slate-400"
                  size={16}
                />
              )}
              <span>
                <strong className="block text-xs text-slate-900">
                  {step.label}
                </strong>
                <small className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                  {step.description}
                </small>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="mt-0.5 text-slate-400"
                size={15}
              />
            </Link>
          </li>
        ))}
      </ol>
      {allowDismiss ? (
        <Link
          className="block border-t border-slate-200 px-4 py-3 text-xs font-semibold text-red-700 hover:bg-red-50"
          to="/app/getting-started"
        >
          Open getting started
        </Link>
      ) : null}
    </section>
  );
}
