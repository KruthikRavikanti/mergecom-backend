import type {
  ComparisonResult,
  ComparisonVisualizationArtifact,
  DocumentFileType,
  SnapshotEnvelope,
  VisualChangeMapping,
  VisualLocator,
} from './types';

export const VISUALIZATION_SCHEMA_VERSION = '1.0.0';
export const VISUALIZATION_ENGINE_VERSION = '1.0.0';

export function createComparisonVisualization(input: {
  baseSnapshot: SnapshotEnvelope;
  comparisonId: string;
  fileType: DocumentFileType;
  rendererProfile: string;
  result: ComparisonResult;
  targetSnapshot: SnapshotEnvelope;
}): ComparisonVisualizationArtifact {
  const mappings = input.result.changes.map((change) => {
    const locators: VisualLocator[] = [];
    if (change.change_type !== 'added') {
      const locator = locatorFor(
        input.fileType,
        input.baseSnapshot,
        change.path,
        change.entity_type,
        'base',
      );
      if (locator) locators.push(locator);
    }
    if (change.change_type !== 'removed') {
      const locator = locatorFor(
        input.fileType,
        input.targetSnapshot,
        change.path,
        change.entity_type,
        'target',
      );
      if (locator) locators.push(locator);
    }
    return mapping(change.id, locators);
  });
  const exact = mappings.filter((item) => item.confidence === 'exact').length;
  const approximate = mappings.filter(
    (item) => item.confidence === 'approximate',
  ).length;
  const unavailable = mappings.length - exact - approximate;
  return {
    comparisonId: input.comparisonId,
    coverage: {
      approximate,
      exact,
      mapped: exact + approximate,
      total: mappings.length,
      unavailable,
    },
    engineVersion: VISUALIZATION_ENGINE_VERSION,
    mappings,
    rendererProfile: input.rendererProfile,
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
  };
}

function mapping(
  changeId: string,
  locators: VisualLocator[],
): VisualChangeMapping {
  const confidence = locators.some((item) => item.confidence === 'exact')
    ? 'exact'
    : locators.some((item) => item.confidence === 'approximate')
      ? 'approximate'
      : 'unavailable';
  return {
    changeId,
    confidence,
    locators,
    reason:
      confidence === 'unavailable'
        ? 'No trustworthy visual location is available for this semantic change.'
        : null,
  };
}

function locatorFor(
  fileType: DocumentFileType,
  snapshot: SnapshotEnvelope,
  path: string,
  entityType: string,
  side: 'base' | 'target',
): VisualLocator | null {
  if (fileType === 'presentation') {
    return presentationLocator(snapshot, path, side);
  }
  if (fileType === 'spreadsheet') {
    const match = /^\/workbook\/sheets\/([^/]+)(?:\/cells\/([^/]+))?$/u.exec(
      path,
    );
    if (!match?.[1]) return null;
    return {
      ...(match[2] ? { cell: match[2] } : {}),
      confidence: match[2] ? 'exact' : 'approximate',
      kind: 'sheet_cell',
      semanticPath: path,
      sheetId: match[1],
      side,
    };
  }
  if (fileType === 'word_document' && path.startsWith('/body')) {
    return {
      confidence: 'exact',
      kind: entityType === 'table_cell' ? 'table_cell' : 'paragraph',
      semanticPath: path,
      side,
    };
  }
  return null;
}

function presentationLocator(
  snapshot: SnapshotEnvelope,
  path: string,
  side: 'base' | 'target',
): VisualLocator | null {
  const match = /^\/presentation\/slides\/(.+?)(?:\/shapes\/([^/]+))?$/u.exec(
    path,
  );
  if (!match?.[1]) return null;
  const payload = asObject(snapshot.format_payload);
  const slides = Array.isArray(payload?.slides) ? payload.slides : [];
  const slide = slides
    .map(asObject)
    .find((item) => item?.part === `/${match[1]}` || item?.part === match[1]);
  const position = positiveNumber(slide?.position);
  if (!position) return null;
  const slidePart = typeof slide?.part === 'string' ? slide.part : match[1];
  const locator: VisualLocator = {
    confidence: match[2] ? 'approximate' : 'exact',
    kind: 'slide',
    page: position,
    semanticPath: path,
    side,
    slideId: slidePart,
  };
  if (!match[2]) return locator;
  const shapes = Array.isArray(slide?.shapes) ? slide.shapes : [];
  const shape = shapes
    .map(asObject)
    .find((item) => String(item?.id) === match[2]);
  const bounds = asObject(shape?.bounds);
  const slideWidth = positiveNumber(payload?.width);
  const slideHeight = positiveNumber(payload?.height);
  const x = nonNegativeNumber(bounds?.x);
  const y = nonNegativeNumber(bounds?.y);
  const width = positiveNumber(bounds?.width);
  const height = positiveNumber(bounds?.height);
  if (
    slideWidth &&
    slideHeight &&
    x !== null &&
    y !== null &&
    width &&
    height
  ) {
    locator.boundingBox = {
      height: Math.min(1, height / slideHeight),
      width: Math.min(1, width / slideWidth),
      x: Math.min(1, x / slideWidth),
      y: Math.min(1, y / slideHeight),
    };
    locator.confidence = 'exact';
  }
  return locator;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
