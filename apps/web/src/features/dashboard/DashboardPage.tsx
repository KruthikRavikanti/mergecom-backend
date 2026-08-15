import {
  Dialog,
  ErrorState,
  LoadingState,
  Toast,
  type ToastKind,
} from '@mergecom/ui';
import { FolderPlus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useProjectsQuery } from '../../api/queries';
import { ProjectCard } from './ProjectCard';

export function DashboardPage() {
  const projects = useProjectsQuery();
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);
  const filtered = useMemo(
    () =>
      projects.data?.filter((project) =>
        `${project.name} ${project.client}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ) ?? [],
    [projects.data, query],
  );

  if (projects.isLoading) return <LoadingState label="Loading projects" />;
  if (projects.isError)
    return (
      <ErrorState
        message="Projects could not be loaded from the development adapter."
        onRetry={() => void projects.refetch()}
      />
    );

  return (
    <section>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-red-700">WORKSPACE</p>
          <h1 className="page-title mt-1">Projects</h1>
          <p className="mt-2 text-sm text-slate-600">
            Review the current development workspace and document history.
          </p>
        </div>
        <button
          className="button-primary"
          type="button"
          onClick={() => setDialogOpen(true)}
        >
          <FolderPlus aria-hidden="true" size={18} />
          New project
        </button>
      </div>
      <label className="relative mt-7 block max-w-md">
        <span className="sr-only">Search projects</span>
        <Search
          aria-hidden="true"
          className="absolute left-3 top-2.5 text-slate-400"
          size={18}
        />
        <input
          className="field pl-10"
          placeholder="Search projects"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {filtered.length ? (
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <p className="mt-10 border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No projects match this search.
        </p>
      )}
      <Dialog
        description="Project persistence begins in Phase 3. This control is intentionally non-destructive in the Phase 1 shell."
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        title="Create project"
      >
        <p className="text-sm leading-6 text-slate-600">
          The workspace does not submit a fake project endpoint. You can inspect
          the seeded projects while the storage-backed workflow is being built.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            className="button-primary"
            type="button"
            onClick={() => {
              setDialogOpen(false);
              setToast({
                kind: 'error',
                message: 'Project creation is not connected in Phase 1.',
              });
            }}
          >
            Close
          </button>
        </div>
      </Dialog>
      {toast ? <Toast kind={toast.kind} message={toast.message} /> : null}
    </section>
  );
}
