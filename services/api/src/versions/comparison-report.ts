import type { ComparisonSummary, VersionComparison } from './types';

export const COMPARISON_REPORT_VERSION = '1.0.0';

export function renderComparisonReport(input: {
  comparison: VersionComparison;
  context: {
    decisionSummary: Record<string, number>;
    documentName: string;
    projectName: string;
    reviewStatus: string | null;
  };
  generatedAt: Date;
  includeValues: boolean;
  summary: ComparisonSummary;
}): string {
  const valueHeaders = input.includeValues
    ? '<th>Before</th><th>After</th>'
    : '';
  const rows = input.comparison.changes
    .map(
      (change) => `<tr>
        <td><code>${escapeHtml(change.id)}</code></td>
        <td>${escapeHtml(change.changeType)}</td>
        <td>${escapeHtml(change.category)}</td>
        <td>${escapeHtml(change.label)}</td>
        <td>${escapeHtml(change.path)}</td>
        ${
          input.includeValues
            ? `<td>${escapeHtml(change.before ?? '')}</td><td>${escapeHtml(change.after ?? '')}</td>`
            : ''
        }
      </tr>`,
    )
    .join('');
  const attention = input.summary.attentionItems.length
    ? input.summary.attentionItems
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.severity)}</strong> ${escapeHtml(item.label)}
              <span>Changes: ${item.changeIds.map(escapeHtml).join(', ')}</span></li>`,
        )
        .join('')
    : '<li>No deterministic attention rules matched.</li>';
  const decisions = Object.entries(input.context.decisionSummary)
    .map(([decision, count]) => `${escapeHtml(decision)}: ${count}`)
    .join(', ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MergeCom comparison report</title>
  <style>
    body { color: #172033; font: 14px/1.5 Arial, sans-serif; margin: 32px; }
    h1, h2 { letter-spacing: 0; }
    dl { display: grid; grid-template-columns: 180px 1fr; gap: 6px 12px; }
    dt { color: #526071; } dd { margin: 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    code { overflow-wrap: anywhere; }
    li span { display: block; color: #526071; font-size: 12px; }
    .notice { border-left: 4px solid #991b1b; padding-left: 12px; }
  </style>
</head>
<body>
  <h1>Comparison report</h1>
  <p class="notice">This deterministic report is derived from persisted comparison metadata. The immutable original Office packages remain authoritative.</p>
  <dl>
    <dt>Project</dt><dd>${escapeHtml(input.context.projectName)}</dd>
    <dt>Document</dt><dd>${escapeHtml(input.context.documentName)}</dd>
    <dt>Direction</dt><dd>Version ${input.comparison.baseVersion.displayNumber} to version ${input.comparison.targetVersion.displayNumber}</dd>
    <dt>Base version ID</dt><dd><code>${escapeHtml(input.comparison.baseVersion.id)}</code></dd>
    <dt>Target version ID</dt><dd><code>${escapeHtml(input.comparison.targetVersion.id)}</code></dd>
    <dt>Comparison ID</dt><dd><code>${escapeHtml(input.comparison.id)}</code></dd>
    <dt>Summary version</dt><dd>${escapeHtml(input.summary.schemaVersion)}</dd>
    <dt>Report version</dt><dd>${COMPARISON_REPORT_VERSION}</dd>
    <dt>Created</dt><dd>${input.generatedAt.toISOString()}</dd>
    <dt>Review status</dt><dd>${escapeHtml(input.context.reviewStatus ?? 'No review')}</dd>
    <dt>Decisions</dt><dd>${decisions || 'No decisions'}</dd>
  </dl>
  <h2>Deterministic summary</h2>
  <p>${input.summary.totalChanges} changes: ${input.summary.substantive} substantive and ${input.summary.formattingOnly} formatting-only.</p>
  <p>Semantic coverage: ${input.summary.coverage.semantic}%. Visual mapping: ${input.summary.coverage.visualMapping}%.</p>
  <h2>Attention items</h2>
  <ul>${attention}</ul>
  <h2>Changes</h2>
  <table>
    <thead><tr><th>Stable ID</th><th>Type</th><th>Category</th><th>Label</th><th>Path</th>${valueHeaders}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
