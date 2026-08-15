import { FlaskConical } from 'lucide-react';
import { useState } from 'react';

import type { DevelopmentIdentity } from './session';

const identities: Array<{ id: DevelopmentIdentity; name: string }> = [
  { id: 'alpha-owner', name: 'Avery Chen' },
  { id: 'alpha-admin', name: 'Jordan Lee' },
  { id: 'alpha-project-lead', name: 'Morgan Patel' },
  { id: 'alpha-contributor', name: 'Casey Taylor' },
  { id: 'alpha-reviewer', name: 'Riley Morgan' },
  { id: 'alpha-viewer', name: 'Sam Rivera' },
  { id: 'alpha-external-reviewer', name: 'Alex Kim' },
  { id: 'beta-owner', name: 'Taylor Reed' },
];

export function DevelopmentLoginAction({
  onAuthenticate,
}: {
  onAuthenticate: (identity: DevelopmentIdentity) => Promise<void>;
}) {
  const [identity, setIdentity] = useState<DevelopmentIdentity>('alpha-owner');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  const authenticate = async () => {
    setError(false);
    setPending(true);
    try {
      await onAuthenticate(identity);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-5 border-t border-slate-200 pt-5">
      <label className="block text-sm font-semibold text-slate-700">
        Local identity
        <select
          className="field mt-1"
          value={identity}
          onChange={(event) =>
            setIdentity(event.target.value as DevelopmentIdentity)
          }
        >
          {identities.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button-secondary mt-3 w-full"
        disabled={pending}
        type="button"
        onClick={() => void authenticate()}
      >
        <FlaskConical aria-hidden="true" size={18} />
        {pending ? 'Signing in' : 'Continue with local identity'}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          Local identity could not be verified.
        </p>
      ) : null}
    </div>
  );
}
