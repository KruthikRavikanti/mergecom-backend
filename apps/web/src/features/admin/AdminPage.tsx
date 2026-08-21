import { ErrorState, LoadingState, Toast } from '@mergecom/ui';
import {
  Clipboard,
  Download,
  Send,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';

import {
  useChangeMembershipRoleMutation,
  useChangeMembershipStatusMutation,
  useCreateInvitationMutation,
  useMembersQuery,
  useProductFeedbackQuery,
  useRemoveMembershipMutation,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { canManageAccess, roleLabels } from '../../auth/roles';
import type { OrganizationRole } from '../../auth/session';

const roles = Object.keys(roleLabels) as OrganizationRole[];

export function AdminPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>('reviewer');
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const canAdminister = canManageAccess(user?.activeOrganization?.role);
  const memberships = useMembersQuery(user?.activeOrganization?.id);
  const feedback = useProductFeedbackQuery(
    user?.activeOrganization?.id,
    canAdminister,
  );
  const invitation = useCreateInvitationMutation(user!);
  const changeRole = useChangeMembershipRoleMutation(user!);
  const changeStatus = useChangeMembershipStatusMutation(user!);
  const removeMembership = useRemoveMembershipMutation(user!);

  if (!user || !canAdminister) {
    return <ErrorState message="Administration access is not available." />;
  }
  if (memberships.isLoading)
    return <LoadingState label="Loading access controls" />;
  if (memberships.isError)
    return <ErrorState message="Access controls could not be loaded." />;

  const allowedRoles =
    user.activeOrganization?.role === 'owner'
      ? roles
      : roles.filter(
          (candidate) => candidate !== 'owner' && candidate !== 'admin',
        );

  const submitInvitation = (event: FormEvent) => {
    event.preventDefault();
    setActionError(false);
    setInvitationUrl(null);
    invitation.mutate(
      { email, role },
      {
        onError: () => setActionError(true),
        onSuccess: (created) => {
          setEmail('');
          setInvitationUrl(created.acceptanceUrl ?? null);
        },
      },
    );
  };

  const runAction = (action: () => void) => {
    setActionError(false);
    action();
  };

  const downloadFeedback = () => {
    const blob = new Blob([JSON.stringify(feedback.data ?? [], null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.download = `mergecom-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <p className="text-sm font-bold text-red-700">ADMINISTRATION</p>
      <h1 className="page-title mt-1">Workspace controls</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Invite verified identities and manage assigned organization roles.
      </p>

      <form
        className="mt-7 border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={submitInvitation}
      >
        <h2 className="text-lg font-bold text-slate-950">Invite member</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
          <label className="text-sm font-semibold text-slate-700">
            Verified email
            <input
              className="field mt-1"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Assigned role
            <select
              className="field mt-1"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as OrganizationRole)
              }
            >
              {allowedRoles.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {roleLabels[candidate]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button-primary"
            disabled={invitation.isPending}
            type="submit"
          >
            <Send aria-hidden="true" size={17} />
            {invitation.isPending ? 'Sending' : 'Send invitation'}
          </button>
        </div>
        {invitationUrl ? (
          <div className="mt-4 flex flex-col gap-2 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 break-all">{invitationUrl}</p>
            <button
              className="button-secondary shrink-0"
              title="Copy invitation link"
              type="button"
              onClick={() => void navigator.clipboard.writeText(invitationUrl)}
            >
              <Clipboard aria-hidden="true" size={17} /> Copy
            </button>
          </div>
        ) : null}
      </form>

      <div className="mt-7 overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-5 py-3 font-semibold">Member</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {memberships.data?.map((member) => {
              const privileged =
                member.role === 'owner' || member.role === 'admin';
              const manageable =
                user.activeOrganization?.role === 'owner' || !privileged;
              return (
                <tr key={member.id}>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-950">
                      {member.name}
                    </p>
                    <p className="text-xs text-slate-500">{member.email}</p>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      aria-label={`Role for ${member.name}`}
                      className="min-h-9 w-48 border border-slate-300 bg-white px-2 text-sm"
                      disabled={!manageable || changeRole.isPending}
                      value={member.role}
                      onChange={(event) =>
                        runAction(() =>
                          changeRole.mutate(
                            {
                              membershipId: member.id,
                              role: event.target.value as OrganizationRole,
                            },
                            { onError: () => setActionError(true) },
                          ),
                        )
                      }
                    >
                      {(manageable ? allowedRoles : [member.role]).map(
                        (candidate) => (
                          <option key={candidate} value={candidate}>
                            {roleLabels[candidate]}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {member.status === 'active' ? 'Active' : 'Suspended'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <button
                        aria-label={`${member.status === 'active' ? 'Suspend' : 'Reactivate'} ${member.name}`}
                        className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
                        disabled={!manageable || changeStatus.isPending}
                        title={
                          member.status === 'active'
                            ? 'Suspend member'
                            : 'Reactivate member'
                        }
                        type="button"
                        onClick={() =>
                          runAction(() =>
                            changeStatus.mutate(
                              {
                                membershipId: member.id,
                                status:
                                  member.status === 'active'
                                    ? 'suspended'
                                    : 'active',
                              },
                              { onError: () => setActionError(true) },
                            ),
                          )
                        }
                      >
                        {member.status === 'active' ? (
                          <UserX aria-hidden="true" size={18} />
                        ) : (
                          <UserCheck aria-hidden="true" size={18} />
                        )}
                      </button>
                      <button
                        aria-label={`Remove ${member.name}`}
                        className="rounded p-2 text-red-700 hover:bg-red-50 disabled:text-slate-300"
                        disabled={!manageable || removeMembership.isPending}
                        title="Remove membership"
                        type="button"
                        onClick={() =>
                          runAction(() =>
                            removeMembership.mutate(member.id, {
                              onError: () => setActionError(true),
                            }),
                          )
                        }
                      >
                        <Trash2 aria-hidden="true" size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-9 border-t border-slate-300 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Product feedback
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Tenant-scoped submissions, newest first.
            </p>
          </div>
          <button
            className="button-secondary"
            disabled={!feedback.data?.length}
            type="button"
            onClick={downloadFeedback}
          >
            <Download aria-hidden="true" size={17} />
            Download JSON
          </button>
        </div>
        {feedback.isError ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            Product feedback could not be loaded.
          </p>
        ) : feedback.isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading feedback...</p>
        ) : feedback.data?.length ? (
          <div className="mt-4 overflow-x-auto border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rating</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold">Comment</th>
                  <th className="px-4 py-3 font-semibold">Context</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {feedback.data.slice(0, 25).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-bold text-slate-950">
                      {item.rating}/5
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.reason.replace(/_/gu, ' ')}
                    </td>
                    <td className="max-w-md whitespace-pre-wrap px-4 py-3 text-slate-700">
                      {item.comment ?? 'No comment'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p>{item.resourceType.replace(/_/gu, ' ')}</p>
                      <p className="mt-1 max-w-56 truncate" title={item.route}>
                        {item.route}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 border-y border-slate-200 py-5 text-sm text-slate-500">
            No product feedback has been submitted.
          </p>
        )}
      </section>
      {actionError ? (
        <Toast
          kind="error"
          message="The access change could not be completed."
        />
      ) : null}
    </section>
  );
}
