import { describe, expect, it } from 'vitest';

import {
  buildComparisonSummary,
  classifyComparisonChange,
} from './comparison-summary';
import type { ComparisonChange, VersionComparison } from './types';

function change(
  id: string,
  overrides: Partial<ComparisonChange>,
): ComparisonChange {
  return {
    after: 'After',
    before: 'Before',
    category: 'content',
    changeType: 'modified',
    entityType: 'paragraph',
    id,
    impact: 'medium',
    label: 'Changed content',
    path: '/document/1',
    ...overrides,
  };
}

function comparison(changes: ComparisonChange[]): VersionComparison {
  const reference = {
    artifactSha256: 'a'.repeat(64),
    authorName: 'Avery Chen',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    displayNumber: 1,
    id: '11111111-1111-4111-8111-111111111111',
    note: 'Version',
  };
  return {
    attempts: 1,
    baseVersion: reference,
    byteEqual: false,
    changes,
    comparisonSchemaVersion: '1.0.0',
    completeness: 'partial',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    engineVersion: '1.0.0',
    failureCode: null,
    id: '33333333-3333-4333-8333-333333333333',
    maxAttempts: 3,
    nextAttemptAt: null,
    parserVersion: '1.2.0',
    semanticEqual: false,
    stableHash: 'b'.repeat(64),
    state: 'completed',
    summary: {},
    supportTraceId: '44444444-4444-4444-8444-444444444444',
    targetVersion: {
      ...reference,
      displayNumber: 2,
      id: '22222222-2222-4222-8222-222222222222',
    },
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    warnings: ['Unsupported package feature'],
  };
}

describe('comparison summary', () => {
  it('classifies formula, numeric, date, formatting, and unsupported changes', () => {
    expect(
      classifyComparisonChange(
        change('formula', { after: '=SUM(A1:A2)', entityType: 'formula' }),
      ).category,
    ).toBe('formula');
    expect(
      classifyComparisonChange(change('numeric', { after: '$1,250.00' }))
        .category,
    ).toBe('numeric');
    expect(
      classifyComparisonChange(change('date', { after: '2026-08-21' }))
        .category,
    ).toBe('date');
    expect(
      classifyComparisonChange(change('format', { entityType: 'font style' }))
        .category,
    ).toBe('formatting');
    expect(
      classifyComparisonChange(
        change('unsupported', { category: 'validation' }),
      ).category,
    ).toBe('unsupported');
    expect(
      classifyComparisonChange(
        change('slide-shape', { entityType: 'slide_shape' }),
      ).category,
    ).toBe('text');
    expect(
      classifyComparisonChange(
        change('slide', {
          changeType: 'added',
          entityType: 'slide',
        }),
      ).category,
    ).toBe('structure');
  });

  it('is deterministic and cites only source change IDs', () => {
    const source = comparison([
      change('formula', { after: '=A1+1', entityType: 'formula' }),
      change('numeric', { after: '250', entityType: 'cell' }),
      change('format', { entityType: 'font style' }),
    ]);
    const first = buildComparisonSummary({
      comparison: source,
      usesApprovedBaseline: true,
      visualCoverage: { mapped: 2, total: 3 },
    });
    const second = buildComparisonSummary({
      comparison: source,
      usesApprovedBaseline: true,
      visualCoverage: { mapped: 2, total: 3 },
    });
    expect(second).toEqual(first);
    expect(first.summary.formattingOnly).toBe(1);
    expect(first.summary.substantive).toBe(2);
    expect(first.summary.coverage.visualMapping).toBe(67);
    expect(
      first.summary.attentionItems.flatMap((item) => item.changeIds).sort(),
    ).toEqual(['formula', 'numeric']);
    expect(first.summary.attentionItems[1]?.label).toContain(
      'approved baseline',
    );
  });
});
