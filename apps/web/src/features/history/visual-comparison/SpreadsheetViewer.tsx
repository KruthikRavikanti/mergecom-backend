import { useVirtualizer } from '@tanstack/react-virtual';
import { EyeOff, Sigma } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ComparisonChange } from '../../../api/queries';
import {
  cellCoordinates,
  cellReference,
  type SpreadsheetData,
  type SpreadsheetSheetData,
} from './visual-types';

const ROW_HEIGHT = 30;
const COLUMN_WIDTH = 112;

export interface GridViewport {
  column: number;
  row: number;
}

export function SpreadsheetViewer({
  changes,
  data,
  onSheetChange,
  onViewportChange,
  selectedCell,
  selectedSheetId,
  side,
  viewport,
}: {
  changes: ComparisonChange[];
  data: SpreadsheetData;
  onSheetChange: (sheetId: string) => void;
  onViewportChange: (viewport: GridViewport) => void;
  selectedCell?: string | undefined;
  selectedSheetId?: string | undefined;
  side: 'base' | 'target';
  viewport: GridViewport;
}) {
  const sheet =
    data.sheets.find((candidate) => candidate.sheetId === selectedSheetId) ??
    data.sheets[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState(selectedCell ?? 'A1');
  const geometry = useMemo(() => dimensions(sheet), [sheet]);
  // TanStack Virtual intentionally exposes mutable measurement callbacks.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: geometry.rows,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollRef.current,
    overscan: 8,
  });
  const columnVirtualizer = useVirtualizer({
    count: geometry.columns,
    estimateSize: () => COLUMN_WIDTH,
    getScrollElement: () => scrollRef.current,
    horizontal: true,
    overscan: 3,
  });

  useEffect(() => {
    if (!sheet) return;
    if (selectedCell) {
      const coordinates = cellCoordinates(selectedCell);
      if (coordinates) {
        setActiveCell(selectedCell);
        rowVirtualizer.scrollToIndex(coordinates.row, { align: 'center' });
        columnVirtualizer.scrollToIndex(coordinates.column, {
          align: 'center',
        });
      }
    }
  }, [columnVirtualizer, rowVirtualizer, selectedCell, sheet]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const currentRow = Math.floor(element.scrollTop / ROW_HEIGHT);
    const currentColumn = Math.floor(element.scrollLeft / COLUMN_WIDTH);
    if (Math.abs(currentRow - viewport.row) > 1) {
      rowVirtualizer.scrollToIndex(viewport.row, { align: 'start' });
    }
    if (Math.abs(currentColumn - viewport.column) > 1) {
      columnVirtualizer.scrollToIndex(viewport.column, { align: 'start' });
    }
  }, [columnVirtualizer, rowVirtualizer, viewport]);

  if (!sheet) {
    return <div className="visual-viewer-message">No modeled sheets</div>;
  }
  const cells = new Map(sheet.cells.map((cell) => [cell.reference, cell]));
  const selected = cells.get(activeCell);

  return (
    <div className="spreadsheet-viewer">
      <div className="spreadsheet-formula-bar">
        <strong>{activeCell}</strong>
        <Sigma aria-hidden="true" size={15} />
        <span>{selected?.formula ?? selected?.value ?? ''}</span>
        {selected?.formula ? <em>Stored formula</em> : null}
      </div>
      <SheetHeatMap changes={changes} sheet={sheet} />
      <div
        className="spreadsheet-grid-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          onViewportChange({
            column: Math.max(0, Math.floor(target.scrollLeft / COLUMN_WIDTH)),
            row: Math.max(0, Math.floor(target.scrollTop / ROW_HEIGHT)),
          });
        }}
      >
        <div
          className="spreadsheet-grid-space"
          style={{
            height: rowVirtualizer.getTotalSize() + ROW_HEIGHT,
            width: columnVirtualizer.getTotalSize() + 52,
          }}
        >
          <div className="spreadsheet-corner" />
          {columnVirtualizer.getVirtualItems().map((column) => (
            <div
              className={`spreadsheet-column-header ${isHiddenColumn(sheet, column.index) ? 'is-hidden' : ''}`}
              key={column.key}
              style={{
                left: column.start + 52,
                width: column.size,
              }}
            >
              {cellReference(0, column.index).replace(/[0-9]+$/u, '')}
              {isHiddenColumn(sheet, column.index) ? (
                <EyeOff aria-label="Hidden column" size={12} />
              ) : null}
            </div>
          ))}
          {rowVirtualizer.getVirtualItems().map((row) => (
            <div key={row.key}>
              <div
                className={`spreadsheet-row-header ${sheet.hiddenRows.includes(row.index + 1) ? 'is-hidden' : ''}`}
                style={{ height: row.size, top: row.start + ROW_HEIGHT }}
              >
                {row.index + 1}
              </div>
              {columnVirtualizer.getVirtualItems().map((column) => {
                const reference = cellReference(row.index, column.index);
                const cell = cells.get(reference);
                const change = changeAt(changes, sheet.sheetId, reference);
                return (
                  <button
                    aria-label={`${sheet.name} ${reference}${cell?.value ? `, ${cell.value}` : ''}`}
                    className={`spreadsheet-cell ${activeCell === reference ? 'is-active' : ''} ${change ? `change-${change.changeType}` : ''} ${inMergedRange(reference, sheet.mergedRanges) ? 'is-merged' : ''}`}
                    key={`${row.key}-${column.key}`}
                    style={{
                      height: row.size,
                      left: column.start + 52,
                      top: row.start + ROW_HEIGHT,
                      width: column.size,
                    }}
                    title={
                      cell
                        ? `${reference} / ${cell.dataType}${cell.styleIndex === null ? '' : ` / style ${cell.styleIndex}`}`
                        : reference
                    }
                    type="button"
                    onClick={() => setActiveCell(reference)}
                  >
                    {cell?.value ?? ''}
                    {cell?.formula ? (
                      <span aria-label="Formula">fx</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div aria-label={`${side} workbook sheets`} className="spreadsheet-tabs">
        {data.sheets.map((candidate) => (
          <button
            aria-pressed={candidate.sheetId === sheet.sheetId}
            key={candidate.sheetId}
            type="button"
            onClick={() => onSheetChange(candidate.sheetId)}
          >
            {candidate.name}
            {candidate.visibility !== 'visible' ? (
              <EyeOff aria-label={candidate.visibility} size={13} />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function dimensions(sheet: SpreadsheetSheetData | undefined): {
  columns: number;
  rows: number;
} {
  let rows = 100;
  let columns = 26;
  for (const cell of sheet?.cells ?? []) {
    const location = cellCoordinates(cell.reference);
    if (!location) continue;
    rows = Math.max(rows, location.row + 20);
    columns = Math.max(columns, location.column + 5);
  }
  return {
    columns: Math.min(256, columns),
    rows: Math.min(10_000, rows),
  };
}

function changeAt(
  changes: ComparisonChange[],
  sheetId: string,
  reference: string,
) {
  return changes.find(
    (change) =>
      change.path === `/workbook/sheets/${sheetId}/cells/${reference}`,
  );
}

function SheetHeatMap({
  changes,
  sheet,
}: {
  changes: ComparisonChange[];
  sheet: SpreadsheetSheetData;
}) {
  const buckets = Array.from({ length: 12 }, () => 0);
  for (const change of changes) {
    const prefix = `/workbook/sheets/${sheet.sheetId}/cells/`;
    if (!change.path.startsWith(prefix)) continue;
    const coordinates = cellCoordinates(change.path.slice(prefix.length));
    if (coordinates) buckets[Math.min(11, Math.floor(coordinates.row / 25))]!++;
  }
  const maximum = Math.max(1, ...buckets);
  return (
    <div
      className="spreadsheet-heatmap"
      title="Change concentration by row range"
    >
      <span>Changes</span>
      {buckets.map((count, index) => (
        <i
          aria-label={`Rows ${index * 25 + 1}-${(index + 1) * 25}: ${count} changes`}
          key={index}
          style={{ opacity: count === 0 ? 0.08 : 0.25 + count / maximum / 1.4 }}
        />
      ))}
    </div>
  );
}

function isHiddenColumn(sheet: SpreadsheetSheetData, column: number): boolean {
  const name = cellReference(0, column).replace(/[0-9]+$/u, '');
  return sheet.hiddenColumns.some(
    (range) => range === name || range.split(':').includes(name),
  );
}

function inMergedRange(reference: string, ranges: string[]): boolean {
  const point = cellCoordinates(reference);
  if (!point) return false;
  return ranges.some((range) => {
    const [startValue, endValue] = range.split(':');
    const start = startValue ? cellCoordinates(startValue) : null;
    const end = endValue ? cellCoordinates(endValue) : start;
    return Boolean(
      start &&
      end &&
      point.row >= start.row &&
      point.row <= end.row &&
      point.column >= start.column &&
      point.column <= end.column,
    );
  });
}
