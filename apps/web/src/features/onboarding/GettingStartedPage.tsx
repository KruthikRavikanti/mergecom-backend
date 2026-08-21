import {
  ArrowRight,
  FileSpreadsheet,
  FileText,
  MonitorCog,
  Presentation,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { type DocumentKind, useOnboardingQuery } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { OnboardingChecklist } from './OnboardingChecklist';

const sampleIcons: Record<DocumentKind, typeof FileText> = {
  presentation: Presentation,
  spreadsheet: FileSpreadsheet,
  word_document: FileText,
};

export function GettingStartedPage() {
  const { user } = useAuth();
  const onboarding = useOnboardingQuery(user?.activeOrganization?.id);
  if (!user) return null;

  return (
    <section>
      <div className="border-b border-slate-300 pb-5">
        <p className="text-xs font-bold text-red-700">GETTING STARTED</p>
        <h1 className="page-title mt-1">Learn the core workflow</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Start with synthetic Office files, then connect the desktop add-in to
          your own authorized project.
        </p>
      </div>

      <div className="mt-7 grid gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
        <OnboardingChecklist allowDismiss={false} user={user} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 border-b border-slate-300 pb-2">
            <Sparkles aria-hidden="true" className="text-red-700" size={18} />
            <h2 className="text-base font-bold text-slate-950" id="samples">
              Synthetic sample comparisons
            </h2>
          </div>
          {onboarding.isLoading ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3" aria-busy="true">
              {[1, 2, 3].map((item) => (
                <div
                  className="h-44 animate-pulse border border-slate-200 bg-white"
                  key={item}
                />
              ))}
            </div>
          ) : onboarding.data?.samples.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {onboarding.data.samples.map((sample) => {
                const Icon = sampleIcons[sample.kind];
                return (
                  <article
                    className="border border-slate-300 bg-white p-4"
                    key={sample.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Icon
                        aria-hidden="true"
                        className="text-slate-700"
                        size={21}
                      />
                      <span className="bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                        SYNTHETIC
                      </span>
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-slate-950">
                      {sample.title}
                    </h3>
                    <p className="mt-2 min-h-12 text-xs leading-5 text-slate-600">
                      {sample.description}
                    </p>
                    <Link
                      className="button-secondary mt-4 w-full"
                      to={sample.destination}
                    >
                      Open comparison
                      <ArrowRight aria-hidden="true" size={15} />
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 border border-dashed border-slate-300 bg-white p-6">
              <h3 className="text-sm font-bold text-slate-950">
                Samples are not provisioned
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Ask a workspace operator to provision the tenant-local synthetic
                sample set. Your normal projects remain available.
              </p>
            </div>
          )}

          <section className="mt-8 border-t border-slate-300 pt-6">
            <div className="flex items-start gap-3">
              <MonitorCog
                aria-hidden="true"
                className="mt-0.5 text-slate-700"
                size={20}
              />
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  Office add-in setup
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Check the current host manifest, local certificate, session,
                  and saved-file requirements.
                </p>
                <Link className="button-primary mt-3" to="/app/setup">
                  Open setup
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
