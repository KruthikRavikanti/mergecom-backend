import {
  Columns2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Expand,
  Eye,
  EyeOff,
  Link2,
  Maximize2,
  Minimize2,
  RotateCw,
  Rows3,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export type ComparisonMode = 'overlay' | 'structured' | 'visual';

export function ComparisonToolbar({
  activeSide,
  fit,
  hiddenSide,
  locked,
  mode,
  onActiveSideChange,
  onCopyLink,
  onFitChange,
  onFullscreen,
  onHiddenSideChange,
  onLockedChange,
  onModeChange,
  onPageChange,
  onRotate,
  onSwap,
  onZoom,
  page,
  pageCount,
}: {
  activeSide: 'base' | 'target';
  fit: 'page' | 'width';
  hiddenSide: 'base' | 'target' | null;
  locked: boolean;
  mode: ComparisonMode;
  onActiveSideChange: (side: 'base' | 'target') => void;
  onCopyLink: () => void;
  onFitChange: (fit: 'page' | 'width') => void;
  onFullscreen: () => void;
  onHiddenSideChange: (side: 'base' | 'target' | null) => void;
  onLockedChange: (locked: boolean) => void;
  onModeChange: (mode: ComparisonMode) => void;
  onPageChange: (page: number) => void;
  onRotate: () => void;
  onSwap: () => void;
  onZoom: (direction: 'in' | 'out') => void;
  page: number;
  pageCount: number;
}) {
  return (
    <div
      className="comparison-toolbar"
      role="toolbar"
      aria-label="Comparison tools"
    >
      <div
        className="comparison-mode-control"
        role="group"
        aria-label="View mode"
      >
        {(['visual', 'overlay', 'structured'] as const).map((value) => (
          <button
            aria-pressed={mode === value}
            key={value}
            type="button"
            onClick={() => onModeChange(value)}
          >
            {value === 'visual'
              ? 'Visual'
              : value === 'overlay'
                ? 'Overlay'
                : 'Structured'}
          </button>
        ))}
      </div>
      <div
        className="comparison-side-toggle"
        role="group"
        aria-label="Mobile version"
      >
        <button
          aria-pressed={activeSide === 'base'}
          type="button"
          onClick={() => onActiveSideChange('base')}
        >
          Before
        </button>
        <button
          aria-pressed={activeSide === 'target'}
          type="button"
          onClick={() => onActiveSideChange('target')}
        >
          After
        </button>
      </div>
      <div className="comparison-icon-tools">
        <ToolbarButton
          label={
            locked
              ? 'Unlock synchronized navigation'
              : 'Lock synchronized navigation'
          }
          onClick={() => onLockedChange(!locked)}
        >
          {locked ? <Link2 size={17} /> : <Columns2 size={17} />}
        </ToolbarButton>
        <ToolbarButton label="Swap versions" onClick={onSwap}>
          <Rows3 size={17} />
        </ToolbarButton>
        <ToolbarButton
          label={hiddenSide ? 'Show both versions' : 'Hide base version'}
          onClick={() => onHiddenSideChange(hiddenSide ? null : 'base')}
        >
          {hiddenSide ? <Eye size={17} /> : <EyeOff size={17} />}
        </ToolbarButton>
        <ToolbarButton label="Zoom out" onClick={() => onZoom('out')}>
          <ZoomOut size={17} />
        </ToolbarButton>
        <ToolbarButton label="Zoom in" onClick={() => onZoom('in')}>
          <ZoomIn size={17} />
        </ToolbarButton>
        <ToolbarButton label="Rotate clockwise" onClick={onRotate}>
          <RotateCw size={17} />
        </ToolbarButton>
        <ToolbarButton
          label={fit === 'width' ? 'Fit page' : 'Fit width'}
          onClick={() => onFitChange(fit === 'width' ? 'page' : 'width')}
        >
          {fit === 'width' ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </ToolbarButton>
        <ToolbarButton label="Full screen" onClick={onFullscreen}>
          <Expand size={17} />
        </ToolbarButton>
        <ToolbarButton label="Copy comparison link" onClick={onCopyLink}>
          <Copy size={17} />
        </ToolbarButton>
      </div>
      <div className="comparison-page-nav">
        <ToolbarButton
          label="Previous page"
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft size={17} />
        </ToolbarButton>
        <output className="comparison-page-count" aria-label="Current page">
          {page} / {Math.max(1, pageCount)}
        </output>
        <ToolbarButton
          label="Next page"
          onClick={() =>
            onPageChange(Math.min(Math.max(1, pageCount), page + 1))
          }
        >
          <ChevronRight size={17} />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-label={label} title={label} type="button" onClick={onClick}>
      {children}
    </button>
  );
}
