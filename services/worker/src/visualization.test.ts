import { describe, expect, it } from 'vitest';

import type { ComparisonResult, SnapshotEnvelope } from './types';
import { createComparisonVisualization } from './visualization';

const baseResult: ComparisonResult = {
  base_source_sha256: 'a'.repeat(64),
  byte_equal: false,
  changes: [],
  comparison_schema_version: '1.0.0',
  completeness: 'complete',
  engine_version: '1.0.0',
  file_type: 'presentation',
  parser_version: '1.2.0',
  semantic_equal: false,
  stable_hash: 'b'.repeat(64),
  summary: {},
  target_source_sha256: 'c'.repeat(64),
  warnings: [],
};

function snapshot(formatPayload: unknown): SnapshotEnvelope {
  return {
    file_type: 'presentation',
    format_payload: formatPayload,
    package: {},
    parser_version: '1.2.0',
    schema_version: '1.2.0',
    source_sha256: 'a'.repeat(64),
    stable_hash: 'b'.repeat(64),
    unsupported_features: [],
    validation_errors: [],
    warnings: [],
  };
}

describe('createComparisonVisualization', () => {
  it('maps slide shapes with normalized bounds and preserves unavailable changes', () => {
    const officeSnapshot = snapshot({
      height: 5_000,
      slides: [
        {
          part: '/slides/slide1.xml',
          position: 1,
          shapes: [
            {
              bounds: { height: 1_000, width: 2_000, x: 500, y: 250 },
              id: '4',
            },
          ],
        },
      ],
      width: 10_000,
    });
    const artifact = createComparisonVisualization({
      baseSnapshot: officeSnapshot,
      comparisonId: 'comparison-id',
      fileType: 'presentation',
      rendererProfile: 'office-pdf-v1',
      result: {
        ...baseResult,
        changes: [
          {
            after: 'new',
            before: 'old',
            category: 'content',
            change_type: 'modified',
            entity_type: 'slide_shape',
            id: 'change-1',
            impact: 'medium',
            label: 'Title',
            path: '/presentation/slides/slides/slide1.xml/shapes/4',
          },
          {
            after: 'present',
            before: 'absent',
            category: 'feature',
            change_type: 'added',
            entity_type: 'package_feature',
            id: 'change-2',
            impact: 'high',
            label: 'Macros',
            path: '/package/features/macros',
          },
        ],
      },
      targetSnapshot: officeSnapshot,
    });
    expect(artifact.coverage).toEqual({
      approximate: 0,
      exact: 1,
      mapped: 1,
      total: 2,
      unavailable: 1,
    });
    expect(artifact.mappings[0]?.locators[0]?.boundingBox).toEqual({
      height: 0.2,
      width: 0.2,
      x: 0.05,
      y: 0.05,
    });
    expect(artifact.mappings[1]).toMatchObject({
      confidence: 'unavailable',
      locators: [],
    });
  });
});
