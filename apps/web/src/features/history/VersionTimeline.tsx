import { GitCommitHorizontal } from 'lucide-react';

import type { DemoVersion } from '../../demo/types';

const dateFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function VersionTimeline({ versions }: { versions: DemoVersion[] }) {
  if (!versions.length)
    return (
      <p className="border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
        No development versions were found for this document.
      </p>
    );
  return (
    <ol className="divide-y divide-slate-200 border border-slate-200 bg-white">
      {versions.map((version, index) => (
        <li
          className="grid gap-3 p-5 sm:grid-cols-[40px_1fr_auto]"
          key={version.id}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-red-50 text-red-700">
            <GitCommitHorizontal aria-hidden="true" size={19} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-slate-950">{version.label}</h2>
              {index === 0 ? (
                <span className="bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  LATEST
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">{version.note}</p>
            <p className="mt-2 text-xs text-slate-500">
              Prepared by {version.author}
            </p>
          </div>
          <time
            className="text-xs font-medium text-slate-500"
            dateTime={version.timestamp}
          >
            {dateFormatter.format(new Date(version.timestamp))}
          </time>
        </li>
      ))}
    </ol>
  );
}
