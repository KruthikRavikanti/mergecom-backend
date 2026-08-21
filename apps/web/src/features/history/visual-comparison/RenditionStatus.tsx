import { FileClock, FileWarning, LoaderCircle, RefreshCw } from 'lucide-react';

import type { VersionRendition } from '../../../api/queries';

export function RenditionStatus({
  error,
  onRequest,
  requesting,
  rendition,
}: {
  error?: string | undefined;
  onRequest: () => void;
  requesting: boolean;
  rendition?: VersionRendition | undefined;
}) {
  const active =
    requesting ||
    rendition?.state === 'queued' ||
    rendition?.state === 'running' ||
    rendition?.state === 'retryable_failed';
  if (active) {
    return (
      <div className="rendition-status" role="status">
        {rendition?.state === 'queued' ? (
          <FileClock aria-hidden="true" size={22} />
        ) : (
          <LoaderCircle aria-hidden="true" className="animate-spin" size={22} />
        )}
        <strong>
          {rendition?.state === 'retryable_failed'
            ? 'Preview retry scheduled'
            : rendition?.state === 'queued'
              ? 'Preview queued'
              : 'Rendering preview'}
        </strong>
        {rendition ? (
          <span>
            Attempt {rendition.attempts} of {rendition.maxAttempts}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="rendition-status rendition-status-error" role="alert">
      <FileWarning aria-hidden="true" size={22} />
      <strong>Visual preview unavailable</strong>
      <span>
        {error ?? rendition?.failureCode ?? 'No rendition has been requested.'}
      </span>
      <button
        className="button-secondary"
        disabled={requesting}
        type="button"
        onClick={onRequest}
      >
        <RefreshCw aria-hidden="true" size={15} /> Request preview
      </button>
    </div>
  );
}
