import { ErrorState, LoadingState } from '@mergecom/ui';
import {
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  KeyRound,
  MonitorCheck,
  Presentation,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';

import { useOfficeSetupReadinessQuery } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import {
  detectSetupPlatform,
  setupSteps,
  type SetupHost,
  type SetupPlatform,
} from './setup-guidance';

const hosts: Array<{
  icon: typeof FileText;
  label: string;
  value: SetupHost;
}> = [
  { icon: FileText, label: 'Word', value: 'word' },
  { icon: FileSpreadsheet, label: 'Excel', value: 'excel' },
  { icon: Presentation, label: 'PowerPoint', value: 'powerpoint' },
];
const platforms: Array<{ label: string; value: SetupPlatform }> = [
  { label: 'Mac', value: 'mac' },
  { label: 'Windows', value: 'windows' },
  { label: 'Office web', value: 'web' },
];

export function SetupPage() {
  const { user } = useAuth();
  const readiness = useOfficeSetupReadinessQuery(user?.activeOrganization?.id);
  const [host, setHost] = useState<SetupHost>('powerpoint');
  const [platform, setPlatform] = useState<SetupPlatform>(() =>
    detectSetupPlatform({
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    }),
  );

  if (readiness.isLoading)
    return <LoadingState label="Checking Office setup" />;
  if (readiness.isError || !readiness.data) {
    return (
      <ErrorState
        message="Office setup readiness could not be checked."
        onRetry={() => void readiness.refetch()}
      />
    );
  }
  const manifestUrl = readiness.data.manifestUrls[host];
  const steps = setupSteps({ host, platform });

  return (
    <section>
      <div className="border-b border-slate-300 pb-5">
        <p className="text-xs font-bold text-red-700">OFFICE ADD-IN</p>
        <h1 className="page-title mt-1">Setup and readiness</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Install the manifest for the Office host and verify this workspace can
          reach the task pane without exposing configuration secrets.
        </p>
      </div>

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div
            aria-label="Office host"
            className="grid grid-cols-3 border border-slate-300 bg-white p-1"
            role="tablist"
          >
            {hosts.map(({ icon: Icon, label, value }) => (
              <button
                aria-label={label}
                aria-selected={host === value}
                className={`flex min-h-10 items-center justify-center gap-2 px-2 text-sm font-semibold ${host === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                key={value}
                role="tab"
                type="button"
                onClick={() => setHost(value)}
              >
                <Icon aria-hidden="true" size={17} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <div
            aria-label="Office platform"
            className="mt-3 flex overflow-x-auto border border-slate-300 bg-white p-1"
            role="tablist"
          >
            {platforms.map((option) => (
              <button
                aria-selected={platform === option.value}
                className={`min-h-9 flex-1 shrink-0 px-3 text-sm font-semibold ${platform === option.value ? 'bg-red-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                key={option.value}
                role="tab"
                type="button"
                onClick={() => setPlatform(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <section
            className="mt-6 border-t border-slate-300 pt-5"
            aria-labelledby="install-steps"
          >
            <div className="flex items-center justify-between gap-4">
              <h2
                className="text-base font-bold text-slate-950"
                id="install-steps"
              >
                Install {hosts.find((item) => item.value === host)?.label}
              </h2>
              <a
                className="button-secondary shrink-0"
                href={manifestUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink aria-hidden="true" size={16} />
                Manifest
              </a>
            </div>
            <ol className="mt-4 divide-y divide-slate-200 border-y border-slate-200 bg-white">
              {steps.map((step, index) => (
                <li
                  className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 px-4 py-4"
                  key={step}
                >
                  <span className="grid h-7 w-7 place-items-center bg-slate-900 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="min-w-0 break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
            <a
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline"
              href={
                platform === 'mac'
                  ? 'https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac'
                  : platform === 'windows'
                    ? 'https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins'
                    : 'https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing'
              }
              rel="noreferrer"
              target="_blank"
            >
              Microsoft sideloading guidance
              <ExternalLink aria-hidden="true" size={14} />
            </a>
          </section>

          <section className="mt-8 border-t border-slate-300 pt-5">
            <h2 className="text-base font-bold text-slate-950">
              Before linking a file
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              <li>
                Save the Word document, Excel workbook, or PowerPoint
                presentation to a named local or cloud location.
              </li>
              <li>
                Keep the MergeCom local HTTPS development certificate trusted
                while using localhost.
              </li>
              <li>
                Sign in to the same active MergeCom workspace in the task pane
                and web app.
              </li>
              <li>
                Use exact package capture only on supported desktop hosts; typed
                web comparison remains available when rendition or host access
                is unavailable.
              </li>
            </ul>
          </section>
        </div>

        <aside className="border-t border-slate-300 pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h2 className="text-sm font-bold text-slate-950">Readiness</h2>
          <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            <ReadinessRow icon={MonitorCheck} label="API" value="Ready" />
            <ReadinessRow
              icon={KeyRound}
              label="Session"
              value="Authenticated"
            />
            <ReadinessRow
              icon={ShieldCheck}
              label="Environment"
              value={readiness.data.environment}
            />
          </div>
          <dl className="mt-4 space-y-3 text-xs">
            <div>
              <dt className="font-semibold text-slate-500">Task pane</dt>
              <dd className="mt-1 break-all text-slate-800">
                {readiness.data.taskPaneOrigin}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Web app</dt>
              <dd className="mt-1 break-all text-slate-800">
                {readiness.data.webOrigin}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Product version</dt>
              <dd className="mt-1 text-slate-800">
                {readiness.data.productVersion}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}

function ReadinessRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-xs">
      <span className="flex items-center gap-2 font-semibold text-slate-700">
        <Icon aria-hidden="true" className="text-emerald-700" size={16} />
        {label}
      </span>
      <strong className="capitalize text-slate-900">{value}</strong>
    </div>
  );
}
