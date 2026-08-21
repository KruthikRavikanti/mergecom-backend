import { CircleAlert, PanelRightClose, PanelRightOpen } from 'lucide-react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  type ComparisonChange,
  type ReviewRequest,
  type VersionComparison,
  useComparisonVisualizationQuery,
  useComparisonBaselineQuery,
  useComparisonSummaryQuery,
  useRecordComparisonViewerEventMutation,
  useRenditionGrantQuery,
  useRequestRenditionMutation,
  useVersionRenditionQuery,
  useVersionVisualDataQuery,
} from '../../../api/queries';
import type { CurrentUser } from '../../../auth/session';
import { ComparisonTour } from '../../onboarding/ComparisonTour';
import { ChangeNavigator, type ChangeCategoryFilter } from './ChangeNavigator';
import { ComparisonOverview, type ComparisonScope } from './ComparisonOverview';
import { ComparisonInspector } from './ComparisonInspector';
import { ComparisonToolbar, type ComparisonMode } from './ComparisonToolbar';
import type { GridViewport } from './SpreadsheetViewer';
import { VersionViewer } from './VersionViewer';

type Side = 'base' | 'target';

export function VisualComparisonWorkspace({
  comparison,
  documentId,
  onRequestReview,
  projectId,
  review,
  user,
}: {
  comparison: VersionComparison;
  documentId: string;
  onRequestReview: () => void;
  projectId: string;
  review?: ReviewRequest | undefined;
  user: CurrentUser;
}) {
  const organizationId = user.activeOrganization!.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode');
  const [mode, setModeState] = useState<ComparisonMode>(
    initialMode === 'overlay' || initialMode === 'structured'
      ? initialMode
      : 'visual',
  );
  const [activeSide, setActiveSideState] = useState<Side>(
    searchParams.get('side') === 'base' ? 'base' : 'target',
  );
  const [locked, setLocked] = useState(true);
  const [swapped, setSwapped] = useState(false);
  const [hiddenSide, setHiddenSide] = useState<Side | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [fit, setFit] = useState<'page' | 'width'>('page');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(50);
  const [pages, setPages] = useState<Record<Side, number>>({
    base: 1,
    target: 1,
  });
  const [pageCounts, setPageCounts] = useState<Record<Side, number>>({
    base: 1,
    target: 1,
  });
  const [sheetId, setSheetId] = useState<string>();
  const [gridViewport, setGridViewport] = useState<GridViewport>({
    column: 0,
    row: 0,
  });
  const [copyState, setCopyState] = useState<'copied' | 'idle'>('idle');
  const workspaceRef = useRef<HTMLDivElement>(null);
  const activeSideRef = useRef(activeSide);
  const modeRef = useRef(mode);
  const searchParamsRef = useRef(searchParams);
  const autoRequestsStarted = useRef(new Set<Side>());
  const viewerLoadedSides = useRef(new Set<Side>());
  const viewerReported = useRef(false);
  const viewerStartedAt = useRef<number | null>(null);
  const { mutate: recordViewerEvent } =
    useRecordComparisonViewerEventMutation(user);

  useEffect(() => {
    viewerStartedAt.current = performance.now();
  }, []);

  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const requestedScope = searchParams.get('scope');
  const scope: ComparisonScope =
    requestedScope === 'substantive' ||
    requestedScope === 'formatting' ||
    requestedScope === 'unsupported'
      ? requestedScope
      : 'all';
  const requestedCategory = searchParams.get('category');
  const categoryFilter: ChangeCategoryFilter =
    requestedCategory === 'content' ||
    requestedCategory === 'feature' ||
    requestedCategory === 'structure' ||
    requestedCategory === 'validation'
      ? requestedCategory
      : 'all';
  const summary = useComparisonSummaryQuery(
    organizationId,
    projectId,
    documentId,
    comparison.id,
    comparison.state === 'completed',
  );
  const baseline = useComparisonBaselineQuery(
    organizationId,
    projectId,
    documentId,
    comparison.targetVersion.id,
    comparison.state === 'completed',
  );
  const scopedChanges = useMemo(() => {
    if (!summary.data || scope === 'all') return comparison.changes;
    const ids =
      scope === 'formatting'
        ? (summary.data.categories.find(
            (category) => category.key === 'formatting',
          )?.changeIds ?? [])
        : scope === 'unsupported'
          ? (summary.data.categories.find(
              (category) => category.key === 'unsupported',
            )?.changeIds ?? [])
          : summary.data.categories
              .filter(
                (category) =>
                  category.key !== 'formatting' &&
                  category.key !== 'unsupported',
              )
              .flatMap((category) => category.changeIds);
    const included = new Set(ids);
    return comparison.changes.filter((change) => included.has(change.id));
  }, [comparison.changes, scope, summary.data]);
  const selectedId = searchParams.get('change') ?? scopedChanges[0]?.id;
  const selectedChange = useMemo(
    () =>
      scopedChanges.find((change) => change.id === selectedId) ??
      scopedChanges[0],
    [scopedChanges, selectedId],
  );
  const visualization = useComparisonVisualizationQuery(
    organizationId,
    projectId,
    documentId,
    comparison.id,
    comparison.state === 'completed',
  );
  const baseRendition = useVersionRenditionQuery(
    organizationId,
    projectId,
    documentId,
    comparison.baseVersion.id,
    true,
  );
  const targetRendition = useVersionRenditionQuery(
    organizationId,
    projectId,
    documentId,
    comparison.targetVersion.id,
    true,
  );
  const baseRequest = useRequestRenditionMutation(user);
  const targetRequest = useRequestRenditionMutation(user);
  const baseMutate = baseRequest.mutate;
  const targetMutate = targetRequest.mutate;
  const baseGrant = useRenditionGrantQuery(
    user,
    projectId,
    documentId,
    comparison.baseVersion.id,
    baseRendition.data?.id ?? '',
    baseRendition.data?.state === 'completed',
  );
  const targetGrant = useRenditionGrantQuery(
    user,
    projectId,
    documentId,
    comparison.targetVersion.id,
    targetRendition.data?.id ?? '',
    targetRendition.data?.state === 'completed',
  );
  const baseVisualData = useVersionVisualDataQuery(
    organizationId,
    projectId,
    documentId,
    comparison.baseVersion.id,
    true,
  );
  const targetVisualData = useVersionVisualDataQuery(
    organizationId,
    projectId,
    documentId,
    comparison.targetVersion.id,
    true,
  );

  const reportViewer = useCallback(
    (outcome: 'failed' | 'loaded') => {
      if (viewerReported.current) return;
      viewerReported.current = true;
      const now = performance.now();
      recordViewerEvent({
        comparisonId: comparison.id,
        documentId,
        durationMilliseconds: Math.max(
          0,
          Math.min(300_000, Math.round(now - (viewerStartedAt.current ?? now))),
        ),
        outcome,
        projectId,
      });
    },
    [comparison.id, documentId, projectId, recordViewerEvent],
  );

  const markViewerLoaded = useCallback(
    (side: Side) => {
      viewerLoadedSides.current.add(side);
      if (viewerLoadedSides.current.size === 2) reportViewer('loaded');
    },
    [reportViewer],
  );

  useEffect(() => {
    if (baseRendition.isError && !autoRequestsStarted.current.has('base')) {
      autoRequestsStarted.current.add('base');
      baseMutate({
        documentId,
        projectId,
        versionId: comparison.baseVersion.id,
      });
    }
    if (targetRendition.isError && !autoRequestsStarted.current.has('target')) {
      autoRequestsStarted.current.add('target');
      targetMutate({
        documentId,
        projectId,
        versionId: comparison.targetVersion.id,
      });
    }
  }, [
    baseMutate,
    baseRendition.isError,
    comparison.baseVersion.id,
    comparison.targetVersion.id,
    documentId,
    projectId,
    targetMutate,
    targetRendition.isError,
  ]);

  const selectedMapping = useMemo(
    () =>
      visualization.data?.mappings.find(
        (mapping) => mapping.changeId === selectedChange?.id,
      ),
    [selectedChange?.id, visualization.data?.mappings],
  );
  const selectedClassification = useMemo(() => {
    if (!selectedChange || !summary.data) return undefined;
    const category = summary.data.categories.find((candidate) =>
      candidate.changeIds.includes(selectedChange.id),
    );
    if (!category) return undefined;
    return {
      category: category.label,
      reasons: summary.data.attentionItems
        .filter((item) => item.changeIds.includes(selectedChange.id))
        .map((item) => item.label),
    };
  }, [selectedChange, summary.data]);
  const locators = useMemo(
    () => ({
      base: selectedMapping?.locators.find(
        (locator) => locator.side === 'base',
      ),
      target: selectedMapping?.locators.find(
        (locator) => locator.side === 'target',
      ),
    }),
    [selectedMapping],
  );

  useEffect(() => {
    if (!selectedMapping) return;
    const navigation = window.setTimeout(() => {
      const basePage = locators.base?.page;
      const targetPage = locators.target?.page;
      setPages((current) => ({
        base: basePage ?? current.base,
        target: targetPage ?? (locked && basePage ? basePage : current.target),
      }));
      const nextSheet = locators.target?.sheetId ?? locators.base?.sheetId;
      if (nextSheet) setSheetId(nextSheet);
    }, 0);
    return () => window.clearTimeout(navigation);
  }, [locators, locked, selectedMapping]);

  useEffect(() => {
    if (
      mode === 'structured' &&
      baseVisualData.isSuccess &&
      targetVisualData.isSuccess
    ) {
      const report = window.setTimeout(() => reportViewer('loaded'), 0);
      return () => window.clearTimeout(report);
    }
    if (
      baseGrant.isError ||
      targetGrant.isError ||
      baseRendition.data?.state === 'permanently_failed' ||
      targetRendition.data?.state === 'permanently_failed'
    ) {
      const report = window.setTimeout(() => reportViewer('failed'), 0);
      return () => window.clearTimeout(report);
    }
  }, [
    baseGrant.isError,
    baseRendition.data?.state,
    baseVisualData.isSuccess,
    mode,
    reportViewer,
    targetGrant.isError,
    targetRendition.data?.state,
    targetVisualData.isSuccess,
  ]);

  const threadCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const thread of review?.threads ?? []) {
      if (thread.status !== 'open' || !thread.anchor) continue;
      counts.set(
        thread.anchor.changeId,
        (counts.get(thread.anchor.changeId) ?? 0) + 1,
      );
    }
    return counts;
  }, [review]);
  const changeCounts = useMemo(
    () => ({
      base: pageChangeCounts(visualization.data, 'base'),
      target: pageChangeCounts(visualization.data, 'target'),
    }),
    [visualization.data],
  );

  const updateSearch = useCallback(
    (values: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParamsRef.current);
      let changed = false;
      for (const [key, value] of Object.entries(values)) {
        if (value === null) {
          if (!next.has(key)) continue;
          next.delete(key);
          changed = true;
          continue;
        }
        if (next.get(key) === value) continue;
        next.set(key, value);
        changed = true;
      }
      if (!changed) return;
      searchParamsRef.current = next;
      startTransition(() => setSearchParams(next, { replace: true }));
    },
    [setSearchParams],
  );

  const setSelectedChange = useCallback(
    (change: ComparisonChange) => updateSearch({ change: change.id }),
    [updateSearch],
  );

  const setSelectedChangeId = useCallback(
    (changeId: string) => {
      const change = comparison.changes.find(
        (candidate) => candidate.id === changeId,
      );
      if (change) {
        updateSearch({ category: 'all', change: change.id, scope: 'all' });
      }
    },
    [comparison.changes, updateSearch],
  );

  const setScope = useCallback(
    (nextScope: ComparisonScope) => {
      const formattingIds = new Set(
        summary.data?.categories.find(
          (category) => category.key === 'formatting',
        )?.changeIds ?? [],
      );
      const unsupportedIds = new Set(
        summary.data?.categories.find(
          (category) => category.key === 'unsupported',
        )?.changeIds ?? [],
      );
      const first = comparison.changes.find((change) =>
        nextScope === 'all'
          ? true
          : nextScope === 'formatting'
            ? formattingIds.has(change.id)
            : nextScope === 'unsupported'
              ? unsupportedIds.has(change.id)
              : !formattingIds.has(change.id) && !unsupportedIds.has(change.id),
      );
      updateSearch({
        change: first?.id ?? null,
        scope: nextScope,
      });
    },
    [comparison.changes, summary.data?.categories, updateSearch],
  );

  const setCategoryFilter = useCallback(
    (nextFilter: ChangeCategoryFilter) => {
      const first = scopedChanges.find(
        (change) => nextFilter === 'all' || change.category === nextFilter,
      );
      updateSearch({
        category: nextFilter,
        change: first?.id ?? null,
      });
    },
    [scopedChanges, updateSearch],
  );

  const setMode = useCallback(
    (next: ComparisonMode) => {
      if (modeRef.current === next) return;
      modeRef.current = next;
      setModeState(next);
      updateSearch({ mode: next });
    },
    [updateSearch],
  );

  const setActiveSide = useCallback(
    (next: Side) => {
      if (activeSideRef.current === next) return;
      activeSideRef.current = next;
      setActiveSideState(next);
      updateSearch({ side: next });
    },
    [updateSearch],
  );

  const setPage = useCallback(
    (side: Side, page: number) => {
      const bounded = Math.max(1, page);
      setPages((current) => {
        if (locked) {
          return current.base === bounded && current.target === bounded
            ? current
            : { base: bounded, target: bounded };
        }
        return current[side] === bounded
          ? current
          : { ...current, [side]: bounded };
      });
    },
    [locked],
  );

  const setPageCount = useCallback((side: Side, count: number) => {
    setPageCounts((current) =>
      current[side] === count ? current : { ...current, [side]: count },
    );
  }, []);
  const setBasePage = useCallback(
    (page: number) => setPage('base', page),
    [setPage],
  );
  const setTargetPage = useCallback(
    (page: number) => setPage('target', page),
    [setPage],
  );
  const setBasePageCount = useCallback(
    (count: number) => setPageCount('base', count),
    [setPageCount],
  );
  const setTargetPageCount = useCallback(
    (count: number) => setPageCount('target', count),
    [setPageCount],
  );
  const requestBaseRendition = useCallback(
    () =>
      baseMutate({
        documentId,
        projectId,
        versionId: comparison.baseVersion.id,
      }),
    [baseMutate, comparison.baseVersion.id, documentId, projectId],
  );
  const requestTargetRendition = useCallback(
    () =>
      targetMutate({
        documentId,
        projectId,
        versionId: comparison.targetVersion.id,
      }),
    [comparison.targetVersion.id, documentId, projectId, targetMutate],
  );
  const reportViewerFailed = useCallback(
    () => reportViewer('failed'),
    [reportViewer],
  );
  const markBaseViewerLoaded = useCallback(
    () => markViewerLoaded('base'),
    [markViewerLoaded],
  );
  const markTargetViewerLoaded = useCallback(
    () => markViewerLoaded('target'),
    [markViewerLoaded],
  );

  function viewer(side: Side, showFilmstrip = true) {
    const isBase = side === 'base';
    const renditionQuery = isBase ? baseRendition : targetRendition;
    const request = isBase ? baseRequest : targetRequest;
    const grantQuery = isBase ? baseGrant : targetGrant;
    const visualDataQuery = isBase ? baseVisualData : targetVisualData;
    const version = isBase ? comparison.baseVersion : comparison.targetVersion;
    return (
      <VersionViewer
        changeCounts={changeCounts[side]}
        changes={comparison.changes}
        fit={fit}
        grant={grantQuery.data}
        gridViewport={gridViewport}
        locator={locators[side]}
        mode={mode === 'overlay' ? 'visual' : mode}
        onGridViewportChange={setGridViewport}
        onPageChange={isBase ? setBasePage : setTargetPage}
        onPageCount={isBase ? setBasePageCount : setTargetPageCount}
        onRequestRendition={
          isBase ? requestBaseRendition : requestTargetRendition
        }
        onSheetChange={setSheetId}
        onViewerError={reportViewerFailed}
        onViewerLoaded={isBase ? markBaseViewerLoaded : markTargetViewerLoaded}
        page={pages[side]}
        pageCount={pageCounts[side]}
        rendition={renditionQuery.data}
        renditionError={
          renditionQuery.error instanceof Error
            ? renditionQuery.error.message
            : request.error instanceof Error
              ? request.error.message
              : undefined
        }
        requesting={request.isPending}
        rotation={rotation}
        selectedChange={selectedChange}
        selectedSheetId={sheetId}
        showFilmstrip={showFilmstrip}
        side={side}
        title={`Version ${version.displayNumber}`}
        visualData={visualDataQuery.data}
        zoom={zoom}
      />
    );
  }

  const orderedSides: Side[] = swapped
    ? ['target', 'base']
    : ['base', 'target'];
  const visibleSides = orderedSides.filter((side) => side !== hiddenSide);
  const currentPage = pages[activeSide];
  const currentPageCount = pageCounts[activeSide];

  return (
    <div className="visual-comparison-shell" ref={workspaceRef}>
      {searchParams.get('tour') === '1' ? (
        <ComparisonTour
          user={user}
          onClose={() => updateSearch({ tour: null })}
        />
      ) : null}
      {summary.data ? (
        <ComparisonOverview
          baseline={baseline.data}
          comparisonId={comparison.id}
          documentId={documentId}
          onScopeChange={setScope}
          onSelectChange={setSelectedChangeId}
          organizationId={organizationId}
          projectId={projectId}
          scope={scope}
          summary={summary.data}
        />
      ) : summary.isError ? (
        <div className="visual-coverage-warning">
          <CircleAlert aria-hidden="true" size={16} />
          Deterministic summary is temporarily unavailable. The complete change
          set remains available below.
        </div>
      ) : (
        <div className="comparison-overview-loading" aria-busy="true">
          Loading deterministic summary...
        </div>
      )}
      <ComparisonToolbar
        activeSide={activeSide}
        fit={fit}
        hiddenSide={hiddenSide}
        locked={locked}
        mode={mode}
        onActiveSideChange={setActiveSide}
        onCopyLink={() => {
          void navigator.clipboard.writeText(window.location.href).then(() => {
            setCopyState('copied');
            window.setTimeout(() => setCopyState('idle'), 1600);
          });
        }}
        onFitChange={setFit}
        onFullscreen={() => void workspaceRef.current?.requestFullscreen()}
        onHiddenSideChange={setHiddenSide}
        onLockedChange={setLocked}
        onModeChange={setMode}
        onPageChange={(page) => setPage(activeSide, page)}
        onRotate={() => setRotation((current) => (current + 90) % 360)}
        onSwap={() => setSwapped((current) => !current)}
        onZoom={(direction) =>
          setZoom((current) =>
            Math.min(
              2.5,
              Math.max(0.5, current + (direction === 'in' ? 0.1 : -0.1)),
            ),
          )
        }
        page={currentPage}
        pageCount={currentPageCount}
      />
      {copyState === 'copied' ? (
        <div className="comparison-copy-toast" role="status">
          Link copied
        </div>
      ) : null}
      {comparison.completeness === 'partial' ||
      (visualization.data && visualization.data.coverage.unavailable > 0) ? (
        <div className="visual-coverage-warning">
          <CircleAlert aria-hidden="true" size={16} />
          <span>
            Semantic coverage is {comparison.completeness}; visual mapping
            covers {visualization.data?.coverage.mapped ?? 0} of{' '}
            {visualization.data?.coverage.total ?? comparison.changes.length}{' '}
            changes.
          </span>
        </div>
      ) : null}
      <div
        className={`visual-comparison-grid ${inspectorOpen ? '' : 'inspector-closed'}`}
      >
        <ChangeNavigator
          changes={scopedChanges}
          filter={categoryFilter}
          onFilterChange={setCategoryFilter}
          onSelect={setSelectedChange}
          selectedId={selectedChange?.id}
          threadCounts={threadCounts}
          visualization={visualization.data}
        />
        <main className="comparison-viewers" data-tour="version-viewers">
          <button
            aria-label={inspectorOpen ? 'Close inspector' : 'Open inspector'}
            className="inspector-toggle"
            title={inspectorOpen ? 'Close inspector' : 'Open inspector'}
            type="button"
            onClick={() => setInspectorOpen((current) => !current)}
          >
            {inspectorOpen ? (
              <PanelRightClose size={17} />
            ) : (
              <PanelRightOpen size={17} />
            )}
          </button>
          {mode === 'overlay' && visibleSides.length === 2 ? (
            <div className="comparison-overlay-stack">
              <div>{viewer(visibleSides[0]!)}</div>
              <div
                className="comparison-overlay-top"
                style={{ opacity: opacity / 100 }}
              >
                {viewer(visibleSides[1]!, false)}
              </div>
              <label className="comparison-opacity">
                <span>Before</span>
                <input
                  aria-label="Overlay blend"
                  max="100"
                  min="0"
                  type="range"
                  value={opacity}
                  onChange={(event) => setOpacity(Number(event.target.value))}
                />
                <span>After</span>
              </label>
            </div>
          ) : (
            <div
              className={`comparison-pane-grid panes-${visibleSides.length}`}
            >
              {visibleSides.map((side) => (
                <div
                  className={`comparison-pane comparison-pane-${side} ${activeSide === side ? 'is-mobile-active' : ''}`}
                  key={side}
                  onFocusCapture={() => setActiveSide(side)}
                  onPointerDown={() => setActiveSide(side)}
                >
                  {viewer(side)}
                </div>
              ))}
            </div>
          )}
        </main>
        {inspectorOpen ? (
          <ComparisonInspector
            change={selectedChange}
            classification={selectedClassification}
            comparisonId={comparison.id}
            documentId={documentId}
            onRequestReview={onRequestReview}
            projectId={projectId}
            review={review}
            user={user}
            visualization={visualization.data}
          />
        ) : null}
      </div>
    </div>
  );
}

function pageChangeCounts(
  visualization: ReturnType<typeof useComparisonVisualizationQuery>['data'],
  side: Side,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const mapping of visualization?.mappings ?? []) {
    const pages = new Set(
      mapping.locators
        .filter((locator) => locator.side === side && locator.page)
        .map((locator) => locator.page!),
    );
    for (const page of pages) counts.set(page, (counts.get(page) ?? 0) + 1);
  }
  return counts;
}
