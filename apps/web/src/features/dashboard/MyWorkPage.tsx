import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileClock,
  FolderPlus,
  MonitorUp,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  type WorkItem,
  type WorkSection,
  useMyWorkQuery,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { OnboardingChecklist } from '../onboarding/OnboardingChecklist';

const sections: Array<{
  empty: string;
  key: WorkSection;
  label: string;
}> = [
  {
    empty: 'No reviews, failures, or conflicts need your attention.',
    key: 'attention',
    label: 'Needs attention',
  },
  {
    empty: 'Open a document or comparison to add it here.',
    key: 'continue',
    label: 'Continue working',
  },
  {
    empty: 'Completed comparisons, approvals, and versions will appear here.',
    key: 'activity',
    label: 'Recent activity',
  },
];

export function MyWorkPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('section');
  const selected =
    requested === 'attention' ||
    requested === 'continue' ||
    requested === 'activity'
      ? requested
      : 'all';
  const organizationId = user?.activeOrganization?.id;
  const attention = useMyWorkQuery(organizationId, 'attention');
  const continueWork = useMyWorkQuery(organizationId, 'continue');
  const activity = useMyWorkQuery(organizationId, 'activity');
  const queries = { activity, attention, continue: continueWork };

  return (
    <section>
      <div className="border-b border-slate-300 pb-5">
        <p className="text-xs font-bold text-red-700">WORKSPACE</p>
        <h1 className="page-title mt-1">My Work</h1>
        <p className="mt-2 text-sm text-slate-600">
          {user?.activeOrganization?.name}
        </p>
      </div>

      <div
        aria-label="Work section"
        className="mt-5 flex w-full overflow-x-auto border border-slate-300 bg-white p-1 sm:w-fit"
        role="tablist"
      >
        {[
          { label: 'All', value: 'all' },
          ...sections.map((section) => ({
            label: section.label,
            value: section.key,
          })),
        ].map((option) => (
          <button
            aria-selected={selected === option.value}
            className={`shrink-0 px-3 py-1.5 text-sm font-semibold ${selected === option.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            key={option.value}
            role="tab"
            type="button"
            onClick={() =>
              setSearchParams(
                option.value === 'all' ? {} : { section: option.value },
              )
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          {sections
            .filter((section) => selected === 'all' || selected === section.key)
            .map((section) => (
              <WorkSectionView
                empty={section.empty}
                key={section.key}
                label={section.label}
                query={queries[section.key]}
                section={section.key}
              />
            ))}
        </div>
        <aside className="border-t border-slate-300 pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          {user ? <OnboardingChecklist user={user} /> : null}
          <h2 className="mt-6 text-sm font-bold text-slate-900">
            Quick actions
          </h2>
          <div className="mt-3 grid gap-2">
            <Link className="button-secondary justify-start" to="/app/projects">
              <FolderPlus aria-hidden="true" size={17} />
              Create project
            </Link>
            <Link className="button-secondary justify-start" to="/app/projects">
              <Upload aria-hidden="true" size={17} />
              Upload document
            </Link>
            <a
              className="button-secondary justify-start"
              href="https://localhost:5176"
              rel="noreferrer"
              target="_blank"
            >
              <MonitorUp aria-hidden="true" size={17} />
              Open Office add-in
            </a>
          </div>
        </aside>
      </div>
    </section>
  );
}

function WorkSectionView({
  empty,
  label,
  query,
  section,
}: {
  empty: string;
  label: string;
  query: ReturnType<typeof useMyWorkQuery>;
  section: WorkSection;
}) {
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section aria-labelledby={`work-${section}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-300 pb-2">
        <div className="flex items-center gap-2">
          <SectionIcon section={section} />
          <h2
            className="text-base font-bold text-slate-950"
            id={`work-${section}`}
          >
            {label}
          </h2>
        </div>
        {items.length ? (
          <span className="text-xs font-semibold text-slate-500">
            {items.length}
          </span>
        ) : null}
      </div>
      {query.isLoading ? (
        <div className="space-y-2 pt-3" aria-busy="true">
          {[1, 2, 3].map((item) => (
            <div
              className="h-20 animate-pulse border border-slate-200 bg-white"
              key={item}
            />
          ))}
        </div>
      ) : query.isError ? (
        <div className="mt-3 flex items-center justify-between gap-4 border-l-4 border-red-700 bg-white p-4">
          <p className="text-sm text-slate-700">This section could not load.</p>
          <button
            className="button-secondary shrink-0"
            type="button"
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden="true" size={16} />
            Retry
          </button>
        </div>
      ) : items.length ? (
        <>
          <div className="divide-y divide-slate-200 border-x border-b border-slate-200 bg-white">
            {items.map((item) => (
              <WorkItemRow
                item={item}
                key={`${item.itemType}-${item.resourceId}`}
              />
            ))}
          </div>
          {query.hasNextPage ? (
            <button
              className="button-secondary mt-3"
              disabled={query.isFetchingNextPage}
              type="button"
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? 'Loading...' : 'Load more'}
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-3 border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
          {empty}
        </p>
      )}
    </section>
  );
}

function WorkItemRow({ item }: { item: WorkItem }) {
  const description = itemDescription(item);
  return (
    <article className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="truncate text-sm text-slate-950">
            {item.document.name}
          </strong>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${item.section === 'attention' ? 'bg-red-100 text-red-800' : item.section === 'continue' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}
          >
            {readableStatus(item.status)}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{item.project.name}</span>
          <span>{formatRelativeDate(item.updatedAt)}</span>
          {item.actor ? <span>{item.actor.name}</span> : null}
        </div>
      </div>
      <Link className="button-secondary w-full sm:w-auto" to={item.destination}>
        {item.actionLabel}
        <ArrowRight aria-hidden="true" size={15} />
      </Link>
    </article>
  );
}

function SectionIcon({ section }: { section: WorkSection }) {
  const Icon =
    section === 'attention'
      ? AlertTriangle
      : section === 'continue'
        ? FileClock
        : CheckCircle2;
  return (
    <Icon
      aria-hidden="true"
      className={section === 'attention' ? 'text-red-700' : 'text-slate-600'}
      size={18}
    />
  );
}

function itemDescription(item: WorkItem): string {
  const labels: Record<WorkItem['itemType'], string> = {
    approved_version: 'A version reached approval.',
    assigned_review: 'A review is waiting for your decision.',
    awaiting_decisions: 'Your review request is waiting for decisions.',
    changes_requested: 'Reviewers requested changes to your version.',
    comparison_exception: 'A comparison failed or was quarantined.',
    incoming_conflict: 'An incoming version was preserved as a conflict.',
    recent_comparison: 'A comparison completed recently.',
    recent_document: 'You opened this document recently.',
    recent_version: 'A new immutable version is ready.',
    version_exception: 'A version failed or was quarantined.',
  };
  return labels[item.itemType];
}

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
      minutes,
      'minute',
    );
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
      hours,
      'hour',
    );
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    date,
  );
}

function readableStatus(value: unknown): string {
  return typeof value === 'string' ? value.split('_').join(' ') : '';
}
