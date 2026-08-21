import { createHash } from 'node:crypto';

import type {
  ComparisonChange,
  ComparisonSummary,
  ComparisonSummaryCategoryKey,
  VersionComparison,
} from './types';

export const COMPARISON_SUMMARY_SCHEMA_VERSION = '1.0.0';
export const COMPARISON_SUMMARY_ENGINE_VERSION = '1.0.2';

const categoryLabels: Record<ComparisonSummaryCategoryKey, string> = {
  date: 'Date-like values',
  formatting: 'Style and formatting',
  formula: 'Formulas',
  numeric: 'Numeric and currency values',
  position: 'Position and ordering',
  structure: 'Structure',
  text: 'Text and content',
  unsupported: 'Unsupported or uncertain',
};

export function buildComparisonSummary(input: {
  comparison: VersionComparison;
  usesApprovedBaseline: boolean;
  visualCoverage: { mapped: number; total: number } | null;
}): { inputHash: string; summary: ComparisonSummary } {
  const grouped = new Map<ComparisonSummaryCategoryKey, string[]>();
  const attention = new Map<
    string,
    { changeIds: string[]; label: string; severity: 'low' | 'medium' | 'high' }
  >();
  let formattingOnly = 0;

  for (const change of input.comparison.changes) {
    const classification = classifyComparisonChange(change);
    const ids = grouped.get(classification.category) ?? [];
    ids.push(change.id);
    grouped.set(classification.category, ids);
    if (classification.category === 'formatting') formattingOnly += 1;
    if (classification.attention) {
      const current = attention.get(classification.attention.reasonCode);
      if (current) {
        current.changeIds.push(change.id);
      } else {
        attention.set(classification.attention.reasonCode, {
          changeIds: [change.id],
          label:
            classification.attention.reasonCode === 'numeric_value_changed' &&
            input.usesApprovedBaseline
              ? 'Numeric value changed in content present in the approved baseline.'
              : classification.attention.label,
          severity: classification.attention.severity,
        });
      }
    }
  }

  const categories = (
    Object.keys(categoryLabels) as ComparisonSummaryCategoryKey[]
  )
    .map((key) => ({
      changeIds: grouped.get(key) ?? [],
      count: grouped.get(key)?.length ?? 0,
      key,
      label: categoryLabels[key],
    }))
    .filter((category) => category.count > 0);
  const totalChanges = input.comparison.changes.length;
  const unsupported = grouped.get('unsupported')?.length ?? 0;
  const semanticCoverage =
    totalChanges === 0
      ? 100
      : input.comparison.completeness === 'complete'
        ? 100
        : Math.round(((totalChanges - unsupported) / totalChanges) * 100);
  const visualCoverage =
    !input.visualCoverage || input.visualCoverage.total === 0
      ? 0
      : Math.round(
          (input.visualCoverage.mapped / input.visualCoverage.total) * 100,
        );
  const summary: ComparisonSummary = {
    added: countType(input.comparison.changes, 'added'),
    attentionItems: [...attention.entries()].map(([reasonCode, item]) => ({
      ...item,
      reasonCode,
    })),
    categories,
    comparisonId: input.comparison.id,
    coverage: { semantic: semanticCoverage, visualMapping: visualCoverage },
    formattingOnly,
    modified: countType(input.comparison.changes, 'modified'),
    moved: countType(input.comparison.changes, 'moved'),
    removed: countType(input.comparison.changes, 'removed'),
    schemaVersion: COMPARISON_SUMMARY_SCHEMA_VERSION,
    substantive: totalChanges - formattingOnly,
    totalChanges,
  };
  const inputHash = createHash('sha256')
    .update(
      JSON.stringify({
        approvedBaseline: input.usesApprovedBaseline,
        comparisonStableHash: input.comparison.stableHash,
        engineVersion: COMPARISON_SUMMARY_ENGINE_VERSION,
        summary,
      }),
    )
    .digest('hex');
  return { inputHash, summary };
}

export function classifyComparisonChange(change: ComparisonChange): {
  attention: {
    label: string;
    reasonCode: string;
    severity: 'low' | 'medium' | 'high';
  } | null;
  category: ComparisonSummaryCategoryKey;
} {
  const searchable = [
    change.entityType,
    change.label,
    change.path,
    change.before ?? '',
    change.after ?? '',
  ]
    .join(' ')
    .toLowerCase();
  if (
    change.category === 'validation' ||
    /unsupported|uncertain|unknown|unmodeled/u.test(searchable)
  ) {
    return {
      attention: {
        label: 'Unsupported or uncertain content requires manual verification.',
        reasonCode: 'unsupported_content',
        severity: 'medium',
      },
      category: 'unsupported',
    };
  }
  if (
    /formula/u.test(searchable) ||
    [change.before, change.after].some((value) => value?.trim().startsWith('='))
  ) {
    return {
      attention: {
        label:
          'Formula changed and should be verified against its source cells.',
        reasonCode: 'formula_changed',
        severity: 'high',
      },
      category: 'formula',
    };
  }
  if (isNumericValue(change.before) || isNumericValue(change.after)) {
    return {
      attention: {
        label: 'Numeric or currency value changed.',
        reasonCode: 'numeric_value_changed',
        severity: 'medium',
      },
      category: 'numeric',
    };
  }
  if (isDateLike(change.before) || isDateLike(change.after)) {
    return {
      attention: {
        label: 'Date-like value changed.',
        reasonCode: 'date_value_changed',
        severity: 'medium',
      },
      category: 'date',
    };
  }
  if (
    change.category === 'content' &&
    change.changeType === 'modified' &&
    change.before !== null &&
    change.before === change.after
  ) {
    return { attention: null, category: 'formatting' };
  }
  if (isStructuralChange(change)) {
    return {
      attention: {
        label: 'Document structure was added, removed, or reorganized.',
        reasonCode: 'structure_changed',
        severity:
          change.changeType === 'removed' || change.changeType === 'added'
            ? 'high'
            : 'medium',
      },
      category: 'structure',
    };
  }
  if (
    change.changeType === 'moved' ||
    /position|order|sequence|location/u.test(searchable)
  ) {
    return { attention: null, category: 'position' };
  }
  if (
    /style|format|font|fill|color|border|alignment|number format/u.test(
      searchable,
    )
  ) {
    return { attention: null, category: 'formatting' };
  }
  return {
    attention:
      change.changeType === 'removed'
        ? {
            label: 'Existing text or content was removed.',
            reasonCode: 'content_removed',
            severity: 'medium',
          }
        : null,
    category: 'text',
  };
}

function isStructuralChange(change: ComparisonChange): boolean {
  if (change.category === 'structure') return true;
  if (change.changeType !== 'added' && change.changeType !== 'removed') {
    return false;
  }
  return new Set([
    'column',
    'row',
    'section',
    'sheet',
    'slide',
    'table',
    'table_column',
    'table_row',
    'worksheet',
  ]).has(change.entityType.toLowerCase());
}

function countType(
  changes: ComparisonChange[],
  type: ComparisonChange['changeType'],
): number {
  return changes.filter((change) => change.changeType === type).length;
}

function isNumericValue(value: string | null): boolean {
  if (!value) return false;
  return /^\s*[-+]?[$€£]?\s*\d[\d,]*(?:\.\d+)?\s*%?\s*$/u.test(value);
}

function isDateLike(value: string | null): boolean {
  if (!value) return false;
  return (
    /^\s*\d{4}-\d{1,2}-\d{1,2}\s*$/u.test(value) ||
    /^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*$/u.test(value) ||
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/iu.test(
      value,
    )
  );
}
