import { ErrorState, LoadingState } from '@mergecom/ui';
import { ArrowLeft, Files, Users } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { useProjectQuery, type ProjectRole } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { ProjectContents } from './ProjectContents';
import { ProjectTeamPanel } from './ProjectTeamPanel';

const projectRoleLabels: Record<ProjectRole, string> = {
  contributor: 'Contributor',
  project_lead: 'Project lead',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
};

export function ProjectPage() {
  const { folderId = null, projectId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const project = useProjectQuery(user?.activeOrganization?.id, projectId);
  const activeTab = searchParams.get('tab') === 'team' ? 'team' : 'contents';

  if (!user || project.isLoading)
    return <LoadingState label="Loading project" />;
  if (project.isError) {
    return (
      <ErrorState
        message="The project could not be loaded."
        onRetry={() => void project.refetch()}
      />
    );
  }
  if (!project.data)
    return <ErrorState message="This project is unavailable." />;

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
        <div className="min-w-0">
          <p className="text-sm font-bold text-red-700">
            {currentProject.clientName ?? 'Internal project'}
          </p>
          <h1 className="page-title mt-1 break-words">{currentProject.name}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Created by {currentProject.createdBy} ·{' '}
            {projectRoleLabels[currentProject.accessRole]}
          </p>
        </div>
        {currentProject.archivedAt ? (
          <span className="w-fit border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900">
            Archived
          </span>
        ) : null}
      </div>
      <nav
        aria-label="Project views"
        className="mt-5 flex border-b border-slate-200"
      >
        <Link
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${
            activeTab === 'contents'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-slate-600 hover:text-slate-950'
          }`}
          to={
            folderId
              ? `/app/projects/${projectId}/folders/${folderId}`
              : `/app/projects/${projectId}`
          }
        >
          <Files aria-hidden="true" size={17} />
          Contents
        </Link>
        <Link
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${
            activeTab === 'team'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-slate-600 hover:text-slate-950'
          }`}
          to={`/app/projects/${projectId}?tab=team`}
        >
          <Users aria-hidden="true" size={17} />
          Team
        </Link>
      </nav>
      <div className="mt-6">
        {activeTab === 'team' ? (
          <ProjectTeamPanel
            accessRole={currentProject.accessRole}
            projectId={projectId}
            user={user}
          />
        ) : (
          <ProjectContents
            accessRole={currentProject.accessRole}
            folderId={folderId}
            projectId={projectId}
            user={user}
          />
        )}
      </div>
    </section>
  );
}
