import type { ComparisonChange } from '../../../api/queries';

type JsonObject = Record<string, unknown>;

export interface PresentationShapeData {
  bounds: { height: number; width: number; x: number; y: number } | null;
  id: string;
  kind: string;
  name: string;
  text: string;
}

export interface PresentationSlideData {
  hasNotes: boolean;
  part: string;
  position: number;
  shapes: PresentationShapeData[];
}

export interface PresentationData {
  height: number;
  slides: PresentationSlideData[];
  width: number;
}

export interface SpreadsheetCellData {
  dataType: string;
  formula: string | null;
  reference: string;
  styleIndex: number | null;
  value: string;
}

export interface SpreadsheetSheetData {
  cells: SpreadsheetCellData[];
  hiddenColumns: string[];
  hiddenRows: number[];
  mergedRanges: string[];
  name: string;
  position: number;
  sheetId: string;
  visibility: string;
}

export interface SpreadsheetData {
  sheets: SpreadsheetSheetData[];
}

export interface WordBlockData {
  kind: string;
  path: string;
  style: string | null;
  text: string;
}

export interface WordData {
  blocks: WordBlockData[];
}

export function parsePresentation(value: unknown): PresentationData | null {
  const root = object(value);
  const width = number(root?.width);
  const height = number(root?.height);
  if (!root || !width || !height || !Array.isArray(root.slides)) return null;
  const slides = root.slides.flatMap((candidate) => {
    const slide = object(candidate);
    const position = number(slide?.position);
    const part = string(slide?.part);
    if (!slide || !position || !part) return [];
    const shapes = Array.isArray(slide.shapes)
      ? slide.shapes.flatMap((shapeCandidate) => {
          const shape = object(shapeCandidate);
          const id = string(shape?.id);
          if (!shape || !id) return [];
          const bounds = object(shape.bounds);
          const x = number(bounds?.x, true);
          const y = number(bounds?.y, true);
          const shapeWidth = number(bounds?.width);
          const shapeHeight = number(bounds?.height);
          return [
            {
              bounds:
                x !== null &&
                y !== null &&
                shapeWidth !== null &&
                shapeHeight !== null
                  ? { height: shapeHeight, width: shapeWidth, x, y }
                  : null,
              id,
              kind: string(shape.kind) ?? 'shape',
              name: string(shape.name) ?? `Shape ${id}`,
              text: string(shape.text) ?? '',
            },
          ];
        })
      : [];
    return [
      {
        hasNotes: boolean(slide.has_notes ?? slide.hasNotes),
        part,
        position,
        shapes,
      },
    ];
  });
  return { height, slides, width };
}

export function parseSpreadsheet(value: unknown): SpreadsheetData | null {
  const root = object(value);
  if (!root || !Array.isArray(root.sheets)) return null;
  const sheets = root.sheets.flatMap((candidate) => {
    const sheet = object(candidate);
    const name = string(sheet?.name);
    const position = number(sheet?.position);
    if (!sheet || !name || !position) return [];
    const cells = Array.isArray(sheet.cells)
      ? sheet.cells.flatMap((cellCandidate) => {
          const cell = object(cellCandidate);
          const reference = string(cell?.reference);
          if (!cell || !reference) return [];
          return [
            {
              dataType:
                string(cell.data_type ?? cell.dataType) ?? 'unspecified',
              formula: string(cell.formula),
              reference,
              styleIndex: number(cell.style_index ?? cell.styleIndex, true),
              value: string(cell.value) ?? '',
            },
          ];
        })
      : [];
    return [
      {
        cells,
        hiddenColumns: strings(sheet.hidden_columns ?? sheet.hiddenColumns),
        hiddenRows: numbers(sheet.hidden_rows ?? sheet.hiddenRows),
        mergedRanges: strings(sheet.merged_ranges ?? sheet.mergedRanges),
        name,
        position,
        sheetId:
          string(sheet.sheet_id ?? sheet.sheetId) ??
          String(number(sheet.sheet_id ?? sheet.sheetId, true) ?? position),
        visibility: string(sheet.visibility) ?? 'visible',
      },
    ];
  });
  return { sheets };
}

export function parseWord(value: unknown): WordData | null {
  const root = object(value);
  if (!root || !Array.isArray(root.blocks)) return null;
  return {
    blocks: root.blocks.flatMap((candidate) => {
      const block = object(candidate);
      const path = string(block?.path);
      if (!block || !path) return [];
      return [
        {
          kind: string(block.kind) ?? 'paragraph',
          path,
          style: string(block.style),
          text: string(block.text) ?? '',
        },
      ];
    }),
  };
}

export function changeForPath(
  changes: ComparisonChange[],
  path: string,
): ComparisonChange | undefined {
  return changes.find(
    (change) => change.path === path || change.path.startsWith(`${path}/`),
  );
}

export function cellCoordinates(reference: string): {
  column: number;
  row: number;
} | null {
  const match = /^([A-Z]+)([1-9][0-9]*)$/u.exec(reference.toUpperCase());
  if (!match?.[1] || !match[2]) return null;
  let column = 0;
  for (const character of match[1]) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return { column: column - 1, row: Number(match[2]) - 1 };
}

export function cellReference(row: number, column: number): string {
  let current = column + 1;
  let label = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }
  return `${label}${row + 1}`;
}

function object(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function number(value: unknown, allowZero = false): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    (allowZero ? value >= 0 : value > 0)
    ? value
    : null;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isFinite(item),
      )
    : [];
}
