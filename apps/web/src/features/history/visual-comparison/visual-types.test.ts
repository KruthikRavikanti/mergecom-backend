import { describe, expect, it } from 'vitest';

import {
  cellCoordinates,
  parsePresentation,
  parseSpreadsheet,
  parseWord,
} from './visual-types';

describe('visual snapshot adapters', () => {
  it('preserves modeled slide geometry and shape identity', () => {
    expect(
      parsePresentation({
        height: 5_400_000,
        slides: [
          {
            has_notes: true,
            part: '/ppt/slides/slide1.xml',
            position: 1,
            shapes: [
              {
                bounds: {
                  height: 1_000_000,
                  width: 2_000_000,
                  x: 100_000,
                  y: 200_000,
                },
                id: '7',
                kind: 'text_box',
                name: 'Summary',
                text: 'Operating update',
              },
            ],
          },
        ],
        width: 9_600_000,
      }),
    ).toMatchObject({
      height: 5_400_000,
      slides: [
        {
          hasNotes: true,
          shapes: [{ bounds: { x: 100_000 }, id: '7' }],
        },
      ],
      width: 9_600_000,
    });
  });

  it('preserves stored workbook values without recalculating formulas', () => {
    const data = parseSpreadsheet({
      sheets: [
        {
          cells: [
            {
              data_type: 'number',
              formula: 'SUM(B1:B2)',
              reference: 'B3',
              value: '42',
            },
          ],
          hidden_columns: ['D'],
          hidden_rows: [4],
          merged_ranges: ['A1:B1'],
          name: 'Forecast',
          position: 1,
          sheet_id: 3,
          visibility: 'visible',
        },
      ],
    });
    expect(data?.sheets[0]).toMatchObject({
      cells: [{ formula: 'SUM(B1:B2)', reference: 'B3', value: '42' }],
      hiddenColumns: ['D'],
      hiddenRows: [4],
      mergedRanges: ['A1:B1'],
      sheetId: '3',
    });
    expect(cellCoordinates('AA12')).toEqual({ column: 26, row: 11 });
  });

  it('keeps deterministic Word block paths', () => {
    expect(
      parseWord({
        blocks: [
          {
            kind: 'heading',
            path: '/body/paragraphs/0',
            style: 'Heading1',
            text: 'Transaction overview',
          },
        ],
      }),
    ).toEqual({
      blocks: [
        {
          kind: 'heading',
          path: '/body/paragraphs/0',
          style: 'Heading1',
          text: 'Transaction overview',
        },
      ],
    });
  });
});
