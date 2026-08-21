import { describe, expect, it } from 'vitest';

import { renderComparisonReport } from './comparison-report';
import type { ComparisonSummary, VersionComparison } from './types';

describe('comparison report', () => {
  it('redacts values unless explicitly included and escapes metadata', () => {
    const comparison = {
      baseVersion: { displayNumber: 1, id: 'base' },
      changes: [
        {
          after: '<script>after</script>',
          before: 'private before',
          category: 'content',
          changeType: 'modified',
          id: 'change-1',
          label: 'Title',
          path: '/slide/1',
        },
      ],
      id: 'comparison',
      targetVersion: { displayNumber: 2, id: 'target' },
    } as VersionComparison;
    const summary = {
      added: 0,
      attentionItems: [],
      categories: [],
      comparisonId: 'comparison',
      coverage: { semantic: 100, visualMapping: 100 },
      formattingOnly: 0,
      modified: 1,
      moved: 0,
      removed: 0,
      schemaVersion: '1.0.0',
      substantive: 1,
      totalChanges: 1,
    } satisfies ComparisonSummary;
    const context = {
      decisionSummary: {},
      documentName: 'Deck <draft>',
      projectName: 'Project',
      reviewStatus: null,
    };
    const redacted = renderComparisonReport({
      comparison,
      context,
      generatedAt: new Date('2026-01-01T00:00:00.000Z'),
      includeValues: false,
      summary,
    });
    expect(redacted).not.toContain('private before');
    expect(redacted).not.toContain('&lt;script&gt;after');
    expect(redacted).toContain('Deck &lt;draft&gt;');
    const included = renderComparisonReport({
      comparison,
      context,
      generatedAt: new Date('2026-01-01T00:00:00.000Z'),
      includeValues: true,
      summary,
    });
    expect(included).toContain('private before');
    expect(included).toContain('&lt;script&gt;after&lt;/script&gt;');
    expect(included).not.toContain('<script>after</script>');
  });
});
