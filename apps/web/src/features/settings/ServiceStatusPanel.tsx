import { RefreshCw } from 'lucide-react';

import { useApiReadinessQuery } from '../../api/queries';

export function ServiceStatusPanel() {
  const readiness = useApiReadinessQuery();
  const ready = readiness.data?.status === 'ready';
  return (
    <section className="pt-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">API connection</h2>
          <p className="mt-1 text-sm text-slate-600">
            Live status from the generated health client.
          </p>
        </div>
        <button
          aria-label="Refresh API status"
          className="rounded p-2 text-slate-500 hover:bg-slate-100"
          type="button"
          onClick={() => void readiness.refetch()}
        >
          <RefreshCw aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${ready ? 'bg-emerald-600' : 'bg-red-600'}`}
        />
        {readiness.isLoading
          ? 'Checking API'
          : ready
            ? 'API ready'
            : 'API unavailable'}
      </div>
    </section>
  );
}
