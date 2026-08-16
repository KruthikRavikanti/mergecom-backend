import {
  Dialog,
  ErrorState,
  LoadingState,
  Toast,
  type ToastKind,
} from '@mergecom/ui';
import { FolderPlus, Grid2X2, List, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import {
  type Project,
  useArchiveProjectMutation,
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useProjectsQuery,
  useUpdateProjectMutation,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { readFormString } from '../../services/contact';
import { ProjectCard } from './ProjectCard';

export function DashboardPage() {
  const { user } = useAuth();
  const [archived, setArchived] = useState(false);
  const projects = useProjectsQuery(user?.activeOrganization?.id, archived);
  const createProject = useCreateProjectMutation(user!);
  const updateProject = useUpdateProjectMutation(user!);
  const archiveProject = useArchiveProjectMutation(user!);
  const deleteProject = useDeleteProjectMutation(user!);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [toast, setToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);
  const filtered = useMemo(
    () =>
      projects.data?.items.filter((project) =>
        `${project.name} ${project.clientName ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ) ?? [],
    [projects.data, query],
  );
  const canCreate = ['owner', 'admin', 'project_lead'].includes(
    user?.activeOrganization?.role ?? '',
  );

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await createProject.mutateAsync({
        clientName: readFormString(form, 'clientName') || null,
        name: readFormString(form, 'name'),
      });
      setDialogOpen(false);
      setToast({ kind: 'success', message: 'Project created.' });
    } catch (error) {
      setToast({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Project creation failed.',
      });
    }
  }

  async function changeArchive(project: Project, nextArchived: boolean) {
    try {
      await archiveProject.mutateAsync({
        archived: nextArchived,
        expectedUpdatedAt: project.updatedAt,
        projectId: project.id,
      });
      setToast({
        kind: 'success',
        message: nextArchived ? 'Project archived.' : 'Project restored.',
      });
    } catch (error) {
      setToast({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Project update failed.',
      });
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    const form = new FormData(event.currentTarget);
    try {
      await updateProject.mutateAsync({
        clientName: readFormString(form, 'clientName') || null,
        expectedUpdatedAt: editTarget.updatedAt,
        name: readFormString(form, 'name'),
        projectId: editTarget.id,
      });
      setEditTarget(null);
      setToast({ kind: 'success', message: 'Project updated.' });
    } catch (error) {
      setToast({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Project update failed.',
      });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProject.mutateAsync({
        expectedUpdatedAt: deleteTarget.updatedAt,
        projectId: deleteTarget.id,
      });
      setDeleteTarget(null);
      setToast({ kind: 'success', message: 'Project deleted.' });
    } catch (error) {
      setToast({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Project deletion failed.',
      });
    }
  }

  if (projects.isLoading) return <LoadingState label="Loading projects" />;
  if (projects.isError)
    return (
      <ErrorState
        message="Projects could not be loaded."
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
            {user?.activeOrganization?.name}
          </p>
        </div>
        {canCreate ? (
          <button
            className="button-primary"
            type="button"
            onClick={() => setDialogOpen(true)}
          >
            <FolderPlus aria-hidden="true" size={18} />
            New project
          </button>
        ) : null}
      </div>
      <div className="mt-7 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-fit border border-slate-300 bg-white p-1">
          {[
            { label: 'Active', value: false },
            { label: 'Archived', value: true },
          ].map((option) => (
            <button
              className={`px-3 py-1.5 text-sm font-semibold ${archived === option.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              key={option.label}
              type="button"
              onClick={() => setArchived(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative block w-full sm:w-72">
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
          <div className="flex shrink-0 border border-slate-300 bg-white p-1">
            <button
              aria-label="Grid view"
              className={`rounded p-1.5 ${view === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              title="Grid view"
              type="button"
              onClick={() => setView('grid')}
            >
              <Grid2X2 aria-hidden="true" size={18} />
            </button>
            <button
              aria-label="List view"
              className={`rounded p-1.5 ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              title="List view"
              type="button"
              onClick={() => setView('list')}
            >
              <List aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      </div>
      {filtered.length ? (
        <div
          className={
            view === 'grid'
              ? 'mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3'
              : 'mt-6 border border-slate-200'
          }
        >
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              view={view}
              onArchive={(target, next) => void changeArchive(target, next)}
              onDelete={setDeleteTarget}
              onEdit={setEditTarget}
            />
          ))}
        </div>
      ) : (
        <p className="mt-10 border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {query
            ? 'No projects match this search.'
            : `No ${archived ? 'archived' : 'active'} projects.`}
        </p>
      )}
      <Dialog
        description="Create a persisted workspace for folders, documents, and project members."
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        title="Create project"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void submitProject(event)}
        >
          <label className="block text-sm font-semibold text-slate-800">
            Project name
            <input
              className="field mt-1"
              maxLength={160}
              name="name"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Client
            <input className="field mt-1" maxLength={160} name="clientName" />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="button-primary"
              disabled={createProject.isPending}
              type="submit"
            >
              Create project
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        description="Update project metadata from its current saved state."
        onClose={() => setEditTarget(null)}
        open={Boolean(editTarget)}
        title={`Edit ${editTarget?.name ?? 'project'}`}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void submitEdit(event)}
        >
          <label className="block text-sm font-semibold text-slate-800">
            Project name
            <input
              className="field mt-1"
              defaultValue={editTarget?.name}
              maxLength={160}
              name="name"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Client
            <input
              className="field mt-1"
              defaultValue={editTarget?.clientName ?? ''}
              maxLength={160}
              name="clientName"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </button>
            <button
              className="button-primary"
              disabled={updateProject.isPending}
              type="submit"
            >
              Save project
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        description="This removes the project from normal access. Its database record is retained for audit history."
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? 'project'}?`}
      >
        <div className="flex justify-end gap-2">
          <button
            className="button-secondary"
            type="button"
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </button>
          <button
            className="button-primary"
            disabled={deleteProject.isPending}
            type="button"
            onClick={() => void confirmDelete()}
          >
            Delete project
          </button>
        </div>
      </Dialog>
      {toast ? <Toast kind={toast.kind} message={toast.message} /> : null}
    </section>
  );
}
