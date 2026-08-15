import { CheckCircle2, CircleDashed } from 'lucide-react';

const implemented = [
  'Secrets are excluded from source control and local examples are labeled for local use.',
  'Production workspace code contains no password-based demo credentials.',
  'Service readiness reports unavailable dependencies instead of returning a false healthy state.',
  'Legacy prototypes are excluded from workspace builds, CI, and deployment paths.',
];

const planned = [
  'Microsoft Entra ID authentication and authorization controls',
  'Encrypted artifact storage with tenant-scoped access policies',
  'Audit event capture, retention, and administrative review',
  'Independent compliance assessment and production operating evidence',
];

export function SecurityPage() {
  return (
    <main className="bg-slate-50">
      <section className="border-b border-slate-200 bg-slate-950 py-16 text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <p className="text-sm font-bold text-red-300">SECURITY</p>
          <h1 className="mt-3 text-4xl font-bold">Current security posture</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
            This page separates controls implemented in the Phase 1 foundation
            from capabilities that remain planned. MergeCom does not currently
            claim a compliance certification.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Implemented now</h2>
          <ul className="mt-5 space-y-4">
            {implemented.map((item) => (
              <li
                className="flex gap-3 text-sm leading-6 text-slate-700"
                key={item}
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-emerald-700"
                  size={19}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-950">
            Planned, not yet implemented
          </h2>
          <ul className="mt-5 space-y-4">
            {planned.map((item) => (
              <li
                className="flex gap-3 text-sm leading-6 text-slate-700"
                key={item}
              >
                <CircleDashed
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-slate-500"
                  size={19}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
