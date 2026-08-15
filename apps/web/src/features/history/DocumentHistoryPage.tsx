import { ErrorState, LoadingState } from '@mergecom/ui';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { useProjectQuery, useVersionsQuery } from '../../api/queries';
import { VersionTimeline } from './VersionTimeline';

export function DocumentHistoryPage() {
  const { documentId = '', projectId = '' } = useParams();
  const project = useProjectQuery(projectId);
  const versions = useVersionsQuery(projectId, documentId);

  if (project.isLoading || versions.isLoading)
    return <LoadingState label="Loading document history" />;
  if (project.isError || versions.isError)
    return <ErrorState message="Document history could not be loaded." />;
  const document = project.data?.documents.find(
    (candidate) => candidate.id === documentId,
  );
  if (!project.data || !document)
    return (
      <ErrorState message="This document does not exist in the development workspace." />
    );

  return (
    <section>
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline"
        to={`/app/projects/${projectId}`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        {project.data.name}
      </Link>
      <div className="mt-5 border-b border-slate-200 pb-6">
        <p className="text-sm font-bold text-red-700">VERSION HISTORY</p>
        <h1 className="page-title mt-1 break-words">{document.name}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This Phase 1 view uses explicit development fixtures. It does not
          capture, rebuild, or download Office files.
        </p>
      </div>
      <div className="mt-7">
        <VersionTimeline versions={versions.data ?? []} />
      </div>
    </section>
  );
}
