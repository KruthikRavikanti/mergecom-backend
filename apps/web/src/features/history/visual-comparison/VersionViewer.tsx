import { Layers3, Presentation, Table2 } from 'lucide-react';
import { memo, useMemo } from 'react';

import type {
  ComparisonChange,
  ComparisonVisualization,
  RenditionViewGrant,
  VersionRendition,
  VersionVisualData,
} from '../../../api/queries';
import type { ComparisonMode } from './ComparisonToolbar';
import { PdfVersionViewer, type ViewerFit } from './PdfVersionViewer';
import { RenditionStatus } from './RenditionStatus';
import { type GridViewport, SpreadsheetViewer } from './SpreadsheetViewer';
import { ViewerFallback } from './ViewerFallback';
import { parsePresentation, parseSpreadsheet, parseWord } from './visual-types';
import { WordStructuredViewer } from './WordStructuredViewer';

type VisualLocator =
  ComparisonVisualization['mappings'][number]['locators'][number];

export const VersionViewer = memo(function VersionViewer({
  changeCounts,
  changes,
  fit,
  grant,
  gridViewport,
  locator,
  mode,
  onGridViewportChange,
  onPageChange,
  onPageCount,
  onRequestRendition,
  onSheetChange,
  onViewerError,
  onViewerLoaded,
  page,
  pageCount,
  rendition,
  renditionError,
  requesting,
  rotation,
  selectedChange,
  selectedSheetId,
  showFilmstrip = true,
  side,
  title,
  visualData,
  zoom,
}: {
  changeCounts: Map<number, number>;
  changes: ComparisonChange[];
  fit: ViewerFit;
  grant?: RenditionViewGrant | undefined;
  gridViewport: GridViewport;
  locator?: VisualLocator | undefined;
  mode: ComparisonMode;
  onGridViewportChange: (viewport: GridViewport) => void;
  onPageChange: (page: number) => void;
  onPageCount: (count: number) => void;
  onRequestRendition: () => void;
  onSheetChange: (sheetId: string) => void;
  onViewerError: () => void;
  onViewerLoaded: () => void;
  page: number;
  pageCount: number;
  rendition?: VersionRendition | undefined;
  renditionError?: string | undefined;
  requesting: boolean;
  rotation: number;
  selectedChange?: ComparisonChange | undefined;
  selectedSheetId?: string | undefined;
  showFilmstrip?: boolean;
  side: 'base' | 'target';
  title: string;
  visualData?: VersionVisualData | undefined;
  zoom: number;
}) {
  const absent =
    selectedChange &&
    ((selectedChange.changeType === 'added' && side === 'base') ||
      (selectedChange.changeType === 'removed' && side === 'target'));
  const fileType = visualData?.fileType;
  const structured = mode === 'structured';
  const presentationData = useMemo(
    () =>
      structured && fileType === 'presentation'
        ? parsePresentation(visualData?.payload)
        : null,
    [fileType, structured, visualData?.payload],
  );
  const spreadsheetData = useMemo(
    () =>
      structured && fileType === 'spreadsheet'
        ? parseSpreadsheet(visualData?.payload)
        : null,
    [fileType, structured, visualData?.payload],
  );
  const wordData = useMemo(
    () =>
      structured && fileType === 'word_document'
        ? parseWord(visualData?.payload)
        : null,
    [fileType, structured, visualData?.payload],
  );

  let content;
  if (absent) {
    content = <ViewerFallback change={selectedChange} side={side} />;
  } else if (structured && fileType === 'spreadsheet') {
    content = spreadsheetData ? (
      <SpreadsheetViewer
        changes={changes}
        data={spreadsheetData}
        onSheetChange={onSheetChange}
        onViewportChange={onGridViewportChange}
        selectedCell={locator?.cell}
        selectedSheetId={locator?.sheetId ?? selectedSheetId}
        side={side}
        viewport={gridViewport}
      />
    ) : (
      <ViewerFallback change={selectedChange} side={side} />
    );
  } else if (structured && fileType === 'word_document') {
    content = wordData ? (
      <WordStructuredViewer
        changes={changes}
        data={wordData}
        selectedChange={selectedChange}
        side={side}
      />
    ) : (
      <ViewerFallback change={selectedChange} side={side} />
    );
  } else if (structured && fileType === 'presentation') {
    content = presentationData ? (
      <PresentationStructure
        data={presentationData}
        page={page}
        selectedShapeId={shapeId(selectedChange?.path)}
      />
    ) : (
      <ViewerFallback change={selectedChange} side={side} />
    );
  } else if (grant && rendition?.state === 'completed') {
    content = (
      <PdfVersionViewer
        changeCounts={changeCounts}
        filmstrip={showFilmstrip && fileType === 'presentation'}
        fit={fit}
        highlight={locator?.boundingBox}
        onPageChange={onPageChange}
        onPageCount={onPageCount}
        onViewerError={onViewerError}
        onViewerLoaded={onViewerLoaded}
        page={Math.min(Math.max(1, page), Math.max(1, pageCount))}
        rotation={rotation}
        title={title}
        url={grant.url}
        zoom={zoom}
      />
    );
  } else {
    content = (
      <RenditionStatus
        error={renditionError}
        onRequest={onRequestRendition}
        rendition={rendition}
        requesting={requesting}
      />
    );
  }

  return (
    <section className={`version-viewer version-viewer-${side}`}>
      <header>
        <span>{side === 'base' ? 'Before' : 'After'}</span>
        <strong>{title}</strong>
        {fileType === 'presentation' ? (
          <Presentation aria-hidden="true" size={15} />
        ) : fileType === 'spreadsheet' ? (
          <Table2 aria-hidden="true" size={15} />
        ) : (
          <Layers3 aria-hidden="true" size={15} />
        )}
      </header>
      <div className="version-viewer-body">{content}</div>
    </section>
  );
});

function PresentationStructure({
  data,
  page,
  selectedShapeId,
}: {
  data: NonNullable<ReturnType<typeof parsePresentation>>;
  page: number;
  selectedShapeId: string | null;
}) {
  const slide =
    data.slides.find((candidate) => candidate.position === page) ??
    data.slides[0];
  if (!slide)
    return <div className="visual-viewer-message">No modeled slides</div>;
  return (
    <div className="presentation-structure">
      <div>
        <strong>Slide {slide.position}</strong>
        <span>{slide.shapes.length} shapes</span>
        {slide.hasNotes ? <span>Notes</span> : null}
      </div>
      <div
        className="presentation-structure-slide"
        style={{ aspectRatio: `${data.width} / ${data.height}` }}
      >
        {slide.shapes.map((shape) =>
          shape.bounds ? (
            <article
              className={shape.id === selectedShapeId ? 'is-selected' : ''}
              key={shape.id}
              style={{
                height: `${(shape.bounds.height / data.height) * 100}%`,
                left: `${(shape.bounds.x / data.width) * 100}%`,
                top: `${(shape.bounds.y / data.height) * 100}%`,
                width: `${(shape.bounds.width / data.width) * 100}%`,
              }}
              title={`${shape.name} / ${shape.kind}`}
            >
              {shape.text || shape.name}
            </article>
          ) : null,
        )}
      </div>
    </div>
  );
}

function shapeId(path: string | undefined): string | null {
  return path ? (/\/shapes\/([^/]+)$/u.exec(path)?.[1] ?? null) : null;
}
