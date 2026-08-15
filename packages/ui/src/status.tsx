import { AlertCircle, LoaderCircle } from 'lucide-react';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-600"
      role="status"
    >
      <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="border-l-4 border-red-600 bg-red-50 p-4 text-red-950"
      role="alert"
    >
      <div className="flex gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
        <div>
          <p className="text-sm font-medium">{message}</p>
          {onRetry ? (
            <button
              className="mt-2 text-sm font-semibold underline"
              type="button"
              onClick={onRetry}
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
