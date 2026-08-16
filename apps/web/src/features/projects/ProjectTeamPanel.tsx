import {
  Dialog,
  ErrorState,
  LoadingState,
  Toast,
  type ToastKind,
} from '@mergecom/ui';
import { MailPlus, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import {
  type ProjectRole,
  type ProjectTeamMember,
  useAddProjectMemberMutation,
  useChangeProjectMemberRoleMutation,
  useCreateInvitationMutation,
  useMembersQuery,
  useProjectTeamQuery,
  useRemoveProjectMemberMutation,
} from '../../api/queries';
import { roleLabels } from '../../auth/roles';
import type { CurrentUser, OrganizationRole } from '../../auth/session';
import { readFormString } from '../../services/contact';

const projectRoleLabels: Record<ProjectRole, string> = {
  contributor: 'Contributor',
  project_lead: 'Project lead',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
};
const projectRoles = Object.keys(projectRoleLabels) as ProjectRole[];
const allowedProjectRoles: Record<OrganizationRole, ProjectRole[]> = {
  admin: projectRoles,
  contributor: ['contributor', 'reviewer', 'viewer'],
  external_reviewer: ['reviewer', 'viewer'],
  owner: projectRoles,
  project_lead: projectRoles,
  reviewer: ['reviewer', 'viewer'],
  viewer: ['viewer'],
};

interface ProjectTeamPanelProps {
  accessRole: ProjectRole;
  projectId: string;
  user: CurrentUser;
}

export function ProjectTeamPanel({
  accessRole,
  projectId,
  user,
}: ProjectTeamPanelProps) {
  const organizationId = user.activeOrganization?.id;
  const team = useProjectTeamQuery(organizationId, projectId);
  const members = useMembersQuery(organizationId);
  const addMember = useAddProjectMemberMutation(user);
  const changeRole = useChangeProjectMemberRoleMutation(user);
  const removeMember = useRemoveProjectMemberMutation(user);
  const createInvitation = useCreateInvitationMutation(user);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedMembershipId, setSelectedMembershipId] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProjectTeamMember | null>(
    null,
  );
  const [acceptanceUrl, setAcceptanceUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);
  const canManage = accessRole === 'project_lead';
  const canInvite = ['owner', 'admin'].includes(
    user.activeOrganization?.role ?? '',
  );
  const availableMembers = useMemo(() => {
    const assigned = new Set(
      team.data?.items.map((member) => member.organizationMembershipId),
    );
    return (
      members.data?.filter(
        (member) => member.status === 'active' && !assigned.has(member.id),
      ) ?? []
    );
  }, [members.data, team.data]);
  const selectedMember = availableMembers.find(
    (member) => member.id === selectedMembershipId,
  );
  const addRoles = selectedMember
    ? allowedProjectRoles[selectedMember.role]
    : projectRoles;

  function report(error: unknown, fallback: string) {
    setToast({
      kind: 'error',
      message: error instanceof Error ? error.message : fallback,
    });
  }

  async function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await addMember.mutateAsync({
        organizationMembershipId: readFormString(form, 'membershipId'),
        projectId,
        role: readFormString(form, 'role') as ProjectRole,
      });
      setAddOpen(false);
      setToast({ kind: 'success', message: 'Project member added.' });
    } catch (error) {
      report(error, 'Project member could not be added.');
    }
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const projectRole = readFormString(form, 'role') as 'reviewer' | 'viewer';
    try {
      const invitation = await createInvitation.mutateAsync({
        email: readFormString(form, 'email'),
        projectId,
        projectRole,
        role: 'external_reviewer',
      });
      setAcceptanceUrl(invitation.acceptanceUrl ?? null);
      setToast({ kind: 'success', message: 'Project invitation created.' });
    } catch (error) {
      report(error, 'Project invitation could not be created.');
    }
  }

  async function updateRole(member: ProjectTeamMember, role: ProjectRole) {
    try {
      await changeRole.mutateAsync({
        projectId,
        projectMembershipId: member.id,
        role,
      });
      setToast({ kind: 'success', message: 'Project role updated.' });
    } catch (error) {
      report(error, 'Project role could not be updated.');
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    try {
      await removeMember.mutateAsync({
        projectId,
        projectMembershipId: removeTarget.id,
      });
      setRemoveTarget(null);
      setToast({ kind: 'success', message: 'Project member removed.' });
    } catch (error) {
      report(error, 'Project member could not be removed.');
    }
  }

  if (team.isLoading) return <LoadingState label="Loading project team" />;
  if (team.isError) {
    return (
      <ErrorState
        message="Project team could not be loaded."
        onRetry={() => void team.refetch()}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Project team</h2>
          <p className="mt-1 text-sm text-slate-600">
            Project roles cannot exceed each person&apos;s organization role.
          </p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            {canInvite ? (
              <button
                className="button-secondary"
                type="button"
                onClick={() => setInviteOpen(true)}
              >
                <MailPlus aria-hidden="true" size={17} />
                Invite
              </button>
            ) : null}
            <button
              className="button-primary"
              type="button"
              onClick={() => {
                setSelectedMembershipId('');
                setAddOpen(true);
              }}
            >
              <UserPlus aria-hidden="true" size={17} />
              Add member
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-5 overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Organization role</th>
              <th className="px-4 py-3">Project role</th>
              <th className="w-14 px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {team.data?.items.map((member) => (
              <tr key={member.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-950">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {roleLabels[member.organizationRole]}
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <select
                      aria-label={`Project role for ${member.name}`}
                      className="field max-w-44"
                      value={member.role}
                      onChange={(event) =>
                        void updateRole(
                          member,
                          event.target.value as ProjectRole,
                        )
                      }
                    >
                      {allowedProjectRoles[member.organizationRole].map(
                        (role) => (
                          <option key={role} value={role}>
                            {projectRoleLabels[role]}
                          </option>
                        ),
                      )}
                    </select>
                  ) : (
                    projectRoleLabels[member.role]
                  )}
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <button
                      aria-label={`Remove ${member.name}`}
                      className="rounded p-2 text-slate-600 hover:bg-red-50 hover:text-red-700"
                      title="Remove from project"
                      type="button"
                      onClick={() => setRemoveTarget(member)}
                    >
                      <Trash2 aria-hidden="true" size={17} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!team.data?.items.length ? (
        <p className="mt-6 border border-dashed border-slate-300 p-7 text-center text-sm text-slate-600">
          No explicit project members.
        </p>
      ) : null}
      <Dialog
        description="Choose an active organization member and a project role within their organization-role cap."
        onClose={() => setAddOpen(false)}
        open={addOpen}
        title="Add project member"
      >
        {members.isError ? (
          <ErrorState message="Organization members could not be loaded." />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => void submitAdd(event)}
          >
            <label className="block text-sm font-semibold text-slate-800">
              Member
              <select
                className="field mt-1"
                name="membershipId"
                required
                value={selectedMembershipId}
                onChange={(event) =>
                  setSelectedMembershipId(event.target.value)
                }
              >
                <option value="">Select a member</option>
                {availableMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {roleLabels[member.role]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Project role
              <select className="field mt-1" defaultValue="viewer" name="role">
                {addRoles.map((role) => (
                  <option key={role} value={role}>
                    {projectRoleLabels[role]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                disabled={!availableMembers.length}
                type="submit"
              >
                Add member
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog
        description="New external users join the organization with a project-scoped reviewer or viewer assignment."
        onClose={() => {
          setInviteOpen(false);
          setAcceptanceUrl(null);
        }}
        open={inviteOpen}
        title="Invite external reviewer"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void submitInvitation(event)}
        >
          <label className="block text-sm font-semibold text-slate-800">
            Work email
            <input className="field mt-1" name="email" type="email" required />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Project role
            <select className="field mt-1" defaultValue="reviewer" name="role">
              <option value="reviewer">Reviewer</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          {acceptanceUrl ? (
            <label className="block text-sm font-semibold text-slate-800">
              Local acceptance link
              <input className="field mt-1" readOnly value={acceptanceUrl} />
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setInviteOpen(false)}
            >
              Close
            </button>
            <button className="button-primary" type="submit">
              Create invitation
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        description="The organization membership is unchanged."
        onClose={() => setRemoveTarget(null)}
        open={Boolean(removeTarget)}
        title={`Remove ${removeTarget?.name ?? 'member'}?`}
      >
        <div className="flex justify-end gap-2">
          <button
            className="button-secondary"
            type="button"
            onClick={() => setRemoveTarget(null)}
          >
            Cancel
          </button>
          <button
            className="button-primary"
            type="button"
            onClick={() => void confirmRemove()}
          >
            Remove
          </button>
        </div>
      </Dialog>
      {toast ? <Toast kind={toast.kind} message={toast.message} /> : null}
    </div>
  );
}
