import { ArrowRight, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { DemoProject } from '../../demo/types';

const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export function ProjectCard({ project }: { project: DemoProject }) {
  return (
    <article className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <img
        alt="Team collaborating on project documents"
        className="h-32 w-full object-cover"
        src={project.imageUrl}
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-950">
              {project.name}
            </h2>
            <p className="truncate text-sm text-slate-600">{project.client}</p>
          </div>
          <span className="shrink-0 border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
            {project.stage}
          </span>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs text-slate-500">
          <Clock3 aria-hidden="true" size={14} />
          Updated {dateFormatter.format(new Date(project.updatedAt))}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-600">
            {project.documents.length} document
            {project.documents.length === 1 ? '' : 's'}
          </p>
          <Link
            aria-label={`Open ${project.name}`}
            className="rounded p-2 text-red-700 hover:bg-red-50"
            to={`/app/projects/${project.id}`}
          >
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </div>
    </article>
  );
}
