import { FlaskConical } from 'lucide-react';

import { demoAuth } from '@mergecom/demo-auth';

export function DemoLoginAction({
  onAuthenticate,
}: {
  onAuthenticate: () => void;
}) {
  if (!demoAuth.enabled) return null;
  return (
    <button
      className="button-secondary mt-3 w-full"
      type="button"
      onClick={onAuthenticate}
    >
      <FlaskConical aria-hidden="true" size={18} />
      Enter development demo
    </button>
  );
}
