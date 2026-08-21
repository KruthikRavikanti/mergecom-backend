import { AlertTriangle, BarChart3, Download, LocateFixed } from 'lucide-react';
import { useState } from 'react';

import type {
  BaselineRecommendation,
  ComparisonSummary,
} from '../../../api/queries';
import { apiUrl } from '../../../api/client';

export type ComparisonScope =
  'all' | 'substantive' | 'formatting' | 'unsupported';

export function ComparisonOverview({
  baseline,
  comparisonId,
  documentId,
  onSelectChange,
  onScopeChange,
  organizationId,
  projectId,
  scope,
  summary,
}: {
  baseline: BaselineRecommendation | undefined;
  comparisonId: string;
  documentId: string;
  onSelectChange: (changeId: string) => void;
  onScopeChange: (scope: ComparisonScope) => void;
  organizationId: string;
  projectId: string;
  scope: ComparisonScope;
  summary: ComparisonSummary;
}) {
  const [includeValues, setIncludeValues] = useState(false);
  const reportPath = `/v1/organizations/${organizationId}/projects/${projectId}/documents/${documentId}/comparisons/${comparisonId}/report?includeValues=${includeValues}`;
  const scopes: Array<{
    count: number;
    label: string;
    value: ComparisonScope;
  }> = [
    { count: summary.totalChanges, label: 'All', value: 'all' },
    {
      count: summary.substantive,
      label: 'Substantive',
      value: 'substantive',
    },
    {
      count: summary.formattingOnly,
      label: 'Formatting',
      value: 'formatting',
    },
    {
      count:
        summary.categories.find((category) => category.key === 'unsupported')
          ?.count ?? 0,
      label: 'Unsupported',
      value: 'unsupported',
    },
  ];

  return (
    <section
      className="comparison-overview"
      aria-labelledby="comparison-overview"
    >
      <div className="comparison-overview-heading">
        <div>
          <span>DETERMINISTIC SUMMARY</span>
          <h2 id="comparison-overview">
            {summary.totalChanges === 0
              ? 'No semantic changes detected.'
              : `${summary.totalChanges} changes detected, including ${summary.substantive} substantive changes.`}
          </h2>
          <p>{baselineLabel(baseline)}</p>
        </div>
        <div className="comparison-report-actions">
          <label>
            <input
              checked={includeValues}
              type="checkbox"
              onChange={(event) => setIncludeValues(event.target.checked)}
            />
            Include before/after values
          </label>
          <a
            className="button-secondary"
            href={apiUrl(reportPath)}
            rel="noreferrer"
            target="_blank"
          >
            <Download aria-hidden="true" size={16} />
            Export report
          </a>
        </div>
      </div>
      <div className="comparison-summary-metrics">
        {summary.categories.map((category) => (
          <button
            key={category.key}
            type="button"
            onClick={() => {
              const first = category.changeIds[0];
              if (first) onSelectChange(first);
            }}
          >
            <span>{category.label}</span>
            <strong>{category.count}</strong>
          </button>
        ))}
      </div>
      <div className="comparison-overview-lower">
        <div>
          <h3>
            <AlertTriangle aria-hidden="true" size={15} />
            Attention
          </h3>
          {summary.attentionItems.length ? (
            <div className="comparison-attention-list">
              {summary.attentionItems.map((item) => (
                <button
                  key={item.reasonCode}
                  type="button"
                  onClick={() => {
                    const first = item.changeIds[0];
                    if (first) onSelectChange(first);
                  }}
                >
                  <span className={`severity-${item.severity}`}>
                    {item.severity}
                  </span>
                  <strong>{item.label}</strong>
                  <small>{item.changeIds.length} linked changes</small>
                </button>
              ))}
            </div>
          ) : (
            <p>No deterministic attention rules matched.</p>
          )}
        </div>
        <div className="comparison-coverage">
          <h3>
            <LocateFixed aria-hidden="true" size={15} />
            Coverage
          </h3>
          <span>
            Semantic <strong>{summary.coverage.semantic}%</strong>
          </span>
          <span>
            Visual mapping <strong>{summary.coverage.visualMapping}%</strong>
          </span>
        </div>
      </div>
      <div
        aria-label="Comparison scope"
        className="comparison-scope-filter"
        role="group"
      >
        <BarChart3 aria-hidden="true" size={16} />
        {scopes.map((item) => (
          <button
            aria-pressed={scope === item.value}
            key={item.value}
            type="button"
            onClick={() => onScopeChange(item.value)}
          >
            {item.label} <span>{item.count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function baselineLabel(baseline: BaselineRecommendation | undefined): string {
  if (!baseline) return 'Loading approved baseline status...';
  if (baseline.approvedState === 'equal') {
    return 'The target is the current approved version.';
  }
  if (baseline.approvedState === 'newer') {
    return 'The current approved version is newer than this target.';
  }
  if (baseline.approvedState === 'unavailable') {
    return 'No approved version is available for this document.';
  }
  if (baseline.reason === 'approved_version') {
    return 'This comparison uses the current approved version as its baseline.';
  }
  return `Approved version ${baseline.approvedVersion?.displayNumber ?? ''} is available as an alternate baseline.`;
}
