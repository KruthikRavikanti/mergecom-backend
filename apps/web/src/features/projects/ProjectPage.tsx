import { ErrorState, LoadingState } from '@mergecom/ui';
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Presentation,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { useProjectQuery } from '../../api/queries';
import type { DemoDocument } from '../../demo/types';

const icons: Record<DemoDocument['type'], typeof FileText> = {
  Presentation,
  Spreadsheet: FileSpreadsheet,
  'Word document': FileText,
};
const dateFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const project = useProjectQuery(projectId);

  if (project.isLoading) return <LoadingState label="Loading project" />;
  if (project.isError)
    return (
      <ErrorState
        message="The project could not be loaded."
        onRetry={() => void project.refetch()}
      />
    );
  if (!project.data)
    return (
      <ErrorState message="This project does not exist in the development workspace." />
    );
  const currentProject = project.data;

  return (
    <section>
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline"
        to="/app"
      >
        <ArrowLeft aria-hidden="true" size={16} />
        Projects
      </Link>
      <div className="mt-5 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-red-700">
            {currentProject.client}
          </p>
          <h1 className="page-title mt-1">{currentProject.name}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Owner: {currentProject.owner}
          </p>
        </div>
        <span className="w-fit border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold">
          {currentProject.stage}
        </span>
      </div>
      <h2 className="mt-8 text-lg font-bold text-slate-950">Documents</h2>
      <div className="mt-4 divide-y divide-slate-200 border border-slate-200 bg-white">
        {currentProject.documents.map((document) => {
          const Icon = icons[document.type];
          return (
            <article
              className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              key={document.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center bg-red-50 text-red-700">
                  <Icon aria-hidden="true" size={21} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-950">
                    {document.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Updated {dateFormatter.format(new Date(document.updatedAt))}
                  </p>
                </div>
              </div>
              <Link
                className="button-secondary"
                to={`/app/projects/${currentProject.id}/documents/${document.id}/history`}
              >
                View history
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
