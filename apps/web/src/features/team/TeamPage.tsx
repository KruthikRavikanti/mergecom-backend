import { ErrorState, LoadingState } from '@mergecom/ui';
import { UserPlus } from 'lucide-react';

import { useMembersQuery } from '../../api/queries';

export function TeamPage() {
  const members = useMembersQuery();
  if (members.isLoading) return <LoadingState label="Loading team" />;
  if (members.isError)
    return <ErrorState message="Team members could not be loaded." />;
  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-red-700">WORKSPACE</p>
          <h1 className="page-title mt-1">Team</h1>
          <p className="mt-2 text-sm text-slate-600">
            Development-only members for route and layout validation.
          </p>
        </div>
        <button className="button-primary" disabled type="button">
          <UserPlus aria-hidden="true" size={18} />
          Invite member
        </button>
      </div>
      <div className="mt-7 overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-5 py-3 font-semibold">Member</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {members.data?.map((member) => (
              <tr key={member.id}>
                <td className="px-5 py-4 font-semibold text-slate-950">
                  {member.name}
                </td>
                <td className="px-5 py-4 text-slate-600">{member.email}</td>
                <td className="px-5 py-4 text-slate-600">{member.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
