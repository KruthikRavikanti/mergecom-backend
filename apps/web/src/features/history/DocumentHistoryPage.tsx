import { ErrorState, LoadingState } from '@mergecom/ui';
import { ArrowLeft, Clock3, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import {
  type DocumentKind,
  useDocumentQuery,
  useProjectQuery,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';

const kindLabels: Record<DocumentKind, string> = {
  presentation: 'Presentation',
  spreadsheet: 'Spreadsheet',
  word_document: 'Word document',
};
const dateFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function DocumentHistoryPage() {
  const { documentId = '', projectId = '' } = useParams();
  const { user } = useAuth();
  const organizationId = user?.activeOrganization?.id;
  const project = useProjectQuery(organizationId, projectId);
  const document = useDocumentQuery(organizationId, projectId, documentId);

  if (!user || project.isLoading || document.isLoading) {
    return <LoadingState label="Loading document" />;
  }
  if (project.isError || document.isError) {
    return (
      <ErrorState
        message="The document could not be loaded."
        onRetry={() => {
          void project.refetch();
          void document.refetch();
        }}
      />
    );
  }
  if (!project.data || !document.data) {
    return <ErrorState message="This document is unavailable." />;
  }

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
        <p className="text-sm font-bold text-red-700">DOCUMENT</p>
        <h1 className="page-title mt-1 break-words">{document.data.name}</h1>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <FileText aria-hidden="true" size={16} />
            {kindLabels[document.data.kind]}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock3 aria-hidden="true" size={16} />
            Updated {dateFormatter.format(new Date(document.data.updatedAt))}
          </span>
        </div>
      </div>
      <div className="mt-7 border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="text-base font-bold text-slate-950">No versions yet</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
          This document record is ready for file uploads and version capture in
          Phase 4.
        </p>
      </div>
    </section>
  );
}
