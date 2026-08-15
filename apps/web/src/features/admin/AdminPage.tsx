import { LockKeyhole, ServerCog, UsersRound } from 'lucide-react';

const areas = [
  {
    icon: UsersRound,
    title: 'Access management',
    copy: 'Tenant roles and invitations begin after Entra ID integration.',
  },
  {
    icon: ServerCog,
    title: 'Service policy',
    copy: 'Retention and processing policy controls are not connected in Phase 1.',
  },
  {
    icon: LockKeyhole,
    title: 'Audit access',
    copy: 'Audit event storage and review arrive in the security implementation phases.',
  },
];

export function AdminPage() {
  return (
    <section>
      <p className="text-sm font-bold text-red-700">ADMINISTRATION</p>
      <h1 className="page-title mt-1">Workspace controls</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        This route establishes the administration boundary without exposing
        prototype password controls or simulating production policy changes.
      </p>
      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        {areas.map(({ copy, icon: Icon, title }) => (
          <article
            className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
            key={title}
          >
            <Icon aria-hidden="true" className="text-red-700" size={23} />
            <h2 className="mt-4 text-base font-bold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
            <span className="mt-5 inline-block bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
              PLANNED
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
