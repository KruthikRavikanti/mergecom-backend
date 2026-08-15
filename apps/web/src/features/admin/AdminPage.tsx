import { ErrorState, LoadingState, Toast } from '@mergecom/ui';
import { Clipboard, Send, Trash2, UserCheck, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import {
  useChangeMembershipRoleMutation,
  useChangeMembershipStatusMutation,
  useCreateInvitationMutation,
  useMembersQuery,
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
  const memberships = useMembersQuery(user?.activeOrganization?.id);
  const invitation = useCreateInvitationMutation(user!);
  const changeRole = useChangeMembershipRoleMutation(user!);
  const changeStatus = useChangeMembershipStatusMutation(user!);
  const removeMembership = useRemoveMembershipMutation(user!);

  if (!user || !canManageAccess(user.activeOrganization?.role)) {
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
      {actionError ? (
        <Toast
          kind="error"
          message="The access change could not be completed."
        />
      ) : null}
    </section>
  );
}
