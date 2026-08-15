import { ErrorState, LoadingState } from '@mergecom/ui';

import { useMembersQuery } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { roleLabels } from '../../auth/roles';

export function TeamPage() {
  const { user } = useAuth();
  const members = useMembersQuery(user?.activeOrganization?.id);
  if (members.isLoading) return <LoadingState label="Loading team" />;
  if (members.isError)
    return <ErrorState message="Team members could not be loaded." />;
  return (
    <section>
      <div>
        <p className="text-sm font-bold text-red-700">WORKSPACE</p>
        <h1 className="page-title mt-1">Team</h1>
        <p className="mt-2 text-sm text-slate-600">
          Active and suspended memberships in{' '}
          {user?.activeOrganization?.name ?? 'this workspace'}.
        </p>
      </div>
      <div className="mt-7 overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-5 py-3 font-semibold">Member</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {members.data?.map((member) => (
              <tr key={member.id}>
                <td className="px-5 py-4 font-semibold text-slate-950">
                  {member.name}
                </td>
                <td className="px-5 py-4 text-slate-600">{member.email}</td>
                <td className="px-5 py-4 text-slate-600">
                  {roleLabels[member.role]}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold ${member.status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}
                  >
                    {member.status === 'active' ? 'Active' : 'Suspended'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
