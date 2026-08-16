import {
  Archive,
  ArrowRight,
  Clock3,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Project } from '../../api/queries';

const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

interface ProjectCardProps {
  onArchive: (project: Project, archived: boolean) => void;
  onDelete: (project: Project) => void;
  onEdit: (project: Project) => void;
  project: Project;
  view: 'grid' | 'list';
}

export function ProjectCard({
  onArchive,
  onDelete,
  onEdit,
  project,
  view,
}: ProjectCardProps) {
  const canManage = project.accessRole === 'project_lead';
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-950">
              {project.name}
            </h2>
            <p className="truncate text-sm text-slate-600">
              {project.clientName ?? 'No client assigned'}
            </p>
          </div>
          <span className="shrink-0 border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
            {project.archivedAt ? 'Archived' : 'Active'}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <Clock3 aria-hidden="true" size={14} />
            Updated {dateFormatter.format(new Date(project.updatedAt))}
          </span>
          <span>
            {project.folderCount} folders, {project.documentCount} documents
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canManage ? (
          <>
            <button
              aria-label="Edit project"
              className="rounded p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              title="Edit project"
              type="button"
              onClick={() => onEdit(project)}
            >
              <Pencil aria-hidden="true" size={18} />
            </button>
            <button
              aria-label={
                project.archivedAt ? 'Restore project' : 'Archive project'
              }
              className="rounded p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              title={project.archivedAt ? 'Restore project' : 'Archive project'}
              type="button"
              onClick={() => onArchive(project, !project.archivedAt)}
            >
              {project.archivedAt ? (
                <RotateCcw aria-hidden="true" size={18} />
              ) : (
                <Archive aria-hidden="true" size={18} />
              )}
            </button>
            <button
              aria-label="Delete project"
              className="rounded p-2 text-slate-600 hover:bg-red-50 hover:text-red-700"
              title="Delete project"
              type="button"
              onClick={() => onDelete(project)}
            >
              <Trash2 aria-hidden="true" size={18} />
            </button>
          </>
        ) : null}
        <Link
          aria-label={`Open ${project.name}`}
          className="rounded p-2 text-red-700 hover:bg-red-50"
          to={`/app/projects/${project.id}`}
        >
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </div>
    </>
  );

  if (view === 'list') {
    return (
      <article className="flex min-h-28 items-center gap-4 border-b border-slate-200 bg-white p-4 last:border-b-0">
        <img
          alt="Team collaborating on project documents"
          className="hidden h-16 w-24 shrink-0 object-cover sm:block"
          src="/images/project-review.jpg"
        />
        {content}
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <img
        alt="Team collaborating on project documents"
        className="h-32 w-full object-cover"
        src="/images/project-review.jpg"
      />
      <div className="flex min-h-44 flex-col justify-between gap-5 p-5">
        {content}
      </div>
    </article>
  );
}
