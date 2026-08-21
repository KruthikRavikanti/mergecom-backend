import { CircleAlert, LocateFixed, MessageCircle, SearchX } from 'lucide-react';
import { memo, useMemo } from 'react';

import type {
  ComparisonChange,
  ComparisonVisualization,
} from '../../../api/queries';

export type ChangeCategoryFilter = 'all' | ComparisonChange['category'];

const filters: Array<{ label: string; value: ChangeCategoryFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Content', value: 'content' },
  { label: 'Structure', value: 'structure' },
  { label: 'Features', value: 'feature' },
  { label: 'Validation', value: 'validation' },
];

export const ChangeNavigator = memo(function ChangeNavigator({
  changes,
  filter,
  onFilterChange,
  onSelect,
  selectedId,
  threadCounts,
  visualization,
}: {
  changes: ComparisonChange[];
  filter: ChangeCategoryFilter;
  onFilterChange: (filter: ChangeCategoryFilter) => void;
  onSelect: (change: ComparisonChange) => void;
  selectedId?: string | undefined;
  threadCounts: Map<string, number>;
  visualization?: ComparisonVisualization | undefined;
}) {
  const visible = useMemo(
    () =>
      changes.filter(
        (change) => filter === 'all' || change.category === filter,
      ),
    [changes, filter],
  );
  const mapping = useMemo(
    () =>
      new Map(
        visualization?.mappings.map((item) => [item.changeId, item]) ?? [],
      ),
    [visualization],
  );
  const filterCounts = useMemo(() => {
    const counts = new Map<ChangeCategoryFilter, number>([
      ['all', changes.length],
    ]);
    for (const change of changes) {
      counts.set(change.category, (counts.get(change.category) ?? 0) + 1);
    }
    return counts;
  }, [changes]);

  function moveSelection(direction: -1 | 1) {
    if (!visible.length) return;
    const current = visible.findIndex((change) => change.id === selectedId);
    const next =
      current < 0 ? 0 : (current + direction + visible.length) % visible.length;
    onSelect(visible[next]!);
  }

  return (
    <aside
      className="change-navigator"
      data-tour="change-rail"
      aria-label="Detected changes"
    >
      <div className="change-navigator-heading">
        <div>
          <h2>Changes</h2>
          <p>{changes.length} semantic records</p>
        </div>
        {visualization ? (
          <span title="Visual mapping coverage">
            <LocateFixed aria-hidden="true" size={14} />
            {visualization.coverage.mapped}/{visualization.coverage.total}
          </span>
        ) : null}
      </div>
      <div
        className="change-filter"
        role="tablist"
        aria-label="Change category"
      >
        {filters.map((item) => {
          const count = filterCounts.get(item.value) ?? 0;
          return (
            <button
              aria-selected={filter === item.value}
              key={item.value}
              role="tab"
              type="button"
              onClick={() => onFilterChange(item.value)}
            >
              {item.label} <span>{count}</span>
            </button>
          );
        })}
      </div>
      <div
        aria-label={`${visible.length} filtered changes`}
        aria-live="polite"
        className="change-list"
        role="listbox"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveSelection(1);
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(-1);
          }
        }}
      >
        {visible.map((change, index) => {
          const visual = mapping.get(change.id);
          const threads = threadCounts.get(change.id) ?? 0;
          return (
            <button
              aria-selected={change.id === selectedId}
              className={`change-list-item change-${change.changeType}`}
              key={change.id}
              role="option"
              type="button"
              onClick={() => onSelect(change)}
            >
              <span className="change-list-index">{index + 1}</span>
              <span className="change-list-content">
                <strong>{change.label}</strong>
                <small>{change.path}</small>
                <span>
                  <b>{change.changeType}</b>
                  <em>{change.impact}</em>
                  {visual?.confidence === 'approximate' ? (
                    <i title="Approximate visual location">
                      <CircleAlert aria-hidden="true" size={12} /> approximate
                    </i>
                  ) : visual?.confidence === 'unavailable' ? (
                    <i title="No visual location">
                      <SearchX aria-hidden="true" size={12} /> unmapped
                    </i>
                  ) : null}
                  {threads ? (
                    <i title={`${threads} unresolved discussions`}>
                      <MessageCircle aria-hidden="true" size={12} /> {threads}
                    </i>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
        {!visible.length ? (
          <div className="change-list-empty">
            <SearchX aria-hidden="true" size={20} />
            <span>No changes in this category</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
});
