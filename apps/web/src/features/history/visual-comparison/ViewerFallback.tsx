import { Braces, FileText } from 'lucide-react';

import type { ComparisonChange } from '../../../api/queries';

export function ViewerFallback({
  change,
  side,
}: {
  change?: ComparisonChange | undefined;
  side: 'base' | 'target';
}) {
  return (
    <div className="viewer-fallback">
      <FileText aria-hidden="true" size={22} />
      <strong>{side === 'base' ? 'Before' : 'After'} semantic value</strong>
      {change ? (
        <>
          <code>{change.path}</code>
          <pre>
            {(side === 'base' ? change.before : change.after) ?? 'None'}
          </pre>
        </>
      ) : (
        <p>No change is selected.</p>
      )}
      <span>
        <Braces aria-hidden="true" size={14} /> Semantic comparison remains
        available
      </span>
    </div>
  );
}
