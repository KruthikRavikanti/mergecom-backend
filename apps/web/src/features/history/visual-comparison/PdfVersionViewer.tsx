import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileWarning, LoaderCircle } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

let pdfRuntime: Promise<typeof import('pdfjs-dist')> | undefined;

async function loadPdfRuntime() {
  pdfRuntime ??= import('pdfjs-dist').then((runtime) => {
    runtime.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    return runtime;
  });
  return pdfRuntime;
}

export type ViewerFit = 'page' | 'width';

interface PdfVersionViewerProps {
  changeCounts?: Map<number, number>;
  filmstrip?: boolean;
  fit: ViewerFit;
  highlight?:
    { height: number; width: number; x: number; y: number } | undefined;
  onPageChange: (page: number) => void;
  onPageCount: (pageCount: number) => void;
  onViewerError: () => void;
  onViewerLoaded: () => void;
  page: number;
  rotation: number;
  title: string;
  url: string;
  zoom: number;
}

export const PdfVersionViewer = memo(function PdfVersionViewer({
  changeCounts,
  filmstrip = false,
  fit,
  highlight,
  onPageChange,
  onPageCount,
  onViewerError,
  onViewerLoaded,
  page,
  rotation,
  title,
  url,
  zoom,
}: PdfVersionViewerProps) {
  const { document, error, loading } = usePdfDocument(url);
  const filmstripRef = useRef<HTMLElement>(null);
  const loadedDocument = useRef<PDFDocumentProxy | null>(null);
  // TanStack Virtual intentionally exposes mutable measurement callbacks.
  // eslint-disable-next-line react-hooks/incompatible-library
  const thumbnailVirtualizer = useVirtualizer({
    count: filmstrip ? (document?.numPages ?? 0) : 0,
    estimateSize: () => 110,
    getScrollElement: () => filmstripRef.current,
    overscan: 2,
  });

  useEffect(() => {
    if (!document) return;
    onPageCount(document.numPages);
    if (loadedDocument.current !== document) {
      loadedDocument.current = document;
      onViewerLoaded();
    }
  }, [document, onPageCount, onViewerLoaded]);

  useEffect(() => {
    if (document && page > document.numPages) {
      onPageChange(document.numPages);
    }
  }, [document, onPageChange, page]);

  useEffect(() => {
    if (!document || !filmstrip) return;
    thumbnailVirtualizer.scrollToIndex(
      Math.min(document.numPages, Math.max(1, page)) - 1,
      { align: 'auto' },
    );
  }, [document, filmstrip, page, thumbnailVirtualizer]);

  useEffect(() => {
    if (error) onViewerError();
  }, [error, onViewerError]);

  if (loading) {
    return <ViewerMessage icon="loading" label={`Loading ${title}`} />;
  }
  if (error || !document) {
    return (
      <ViewerMessage icon="error" label={`${title} preview unavailable`} />
    );
  }

  return (
    <div className="visual-pdf-viewer" data-testid={`pdf-viewer-${title}`}>
      {filmstrip ? (
        <nav
          aria-label={`${title} pages`}
          className="visual-filmstrip"
          ref={filmstripRef}
        >
          <div
            className="visual-filmstrip-track"
            style={{ height: thumbnailVirtualizer.getTotalSize() }}
          >
            {thumbnailVirtualizer.getVirtualItems().map((item) => {
              const pageNumber = item.index + 1;
              return (
                <div
                  className="visual-thumbnail-row"
                  data-index={item.index}
                  key={item.key}
                  ref={thumbnailVirtualizer.measureElement}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <button
                    aria-label={`Page ${pageNumber}`}
                    aria-pressed={page === pageNumber}
                    className="visual-thumbnail"
                    type="button"
                    onClick={() => onPageChange(pageNumber)}
                  >
                    <PdfCanvas
                      document={document}
                      fit="width"
                      page={pageNumber}
                      rotation={0}
                      thumbnail
                      zoom={1}
                    />
                    <span>{pageNumber}</span>
                    {(changeCounts?.get(pageNumber) ?? 0) > 0 ? (
                      <strong>{changeCounts?.get(pageNumber)}</strong>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </nav>
      ) : null}
      <div className="visual-pdf-stage">
        <PdfCanvas
          document={document}
          fit={fit}
          highlight={highlight}
          page={page}
          rotation={rotation}
          zoom={zoom}
        />
      </div>
    </div>
  );
});

const PdfCanvas = memo(function PdfCanvas({
  document,
  fit,
  highlight,
  page,
  rotation,
  thumbnail = false,
  zoom,
}: {
  document: PDFDocumentProxy;
  fit: ViewerFit;
  highlight?:
    { height: number; width: number; x: number; y: number } | undefined;
  page: number;
  rotation: number;
  thumbnail?: boolean;
  zoom: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hostSize, setHostSize] = useState({ height: 0, width: 0 });
  const [renderSize, setRenderSize] = useState({ height: 1, width: 1 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let resizeFrame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const height = Math.round(entry.contentRect.height);
        const width = Math.round(entry.contentRect.width);
        setHostSize((current) =>
          current.height === height && current.width === width
            ? current
            : { height, width },
        );
      });
    });
    observer.observe(host);
    return () => {
      window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || hostSize.width <= 0) return;
    let cancelled = false;
    let renderFrame = 0;
    let renderTask: { cancel: () => void; promise: Promise<void> } | undefined;
    renderFrame = window.requestAnimationFrame(() => {
      void document.getPage(page).then((pdfPage) => {
        if (cancelled) return;
        const base = pdfPage.getViewport({ rotation, scale: 1 });
        const availableWidth = Math.max(
          1,
          hostSize.width - (thumbnail ? 4 : 32),
        );
        const availableHeight = Math.max(
          1,
          hostSize.height - (thumbnail ? 4 : 32),
        );
        const fitScale =
          fit === 'page'
            ? Math.min(
                availableWidth / base.width,
                availableHeight / base.height,
              )
            : availableWidth / base.width;
        const scale = Math.max(0.1, fitScale * zoom);
        const viewport = pdfPage.getViewport({ rotation, scale });
        const ratio = thumbnail ? 1 : Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setRenderSize((current) =>
          current.height === viewport.height && current.width === viewport.width
            ? current
            : { height: viewport.height, width: viewport.width },
        );
        const context = canvas.getContext('2d');
        if (!context) return;
        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
          viewport,
        });
        void renderTask.promise.catch((renderError: unknown) => {
          if (
            !cancelled &&
            !(
              renderError instanceof Error &&
              renderError.name === 'RenderingCancelledException'
            )
          ) {
            throw renderError;
          }
        });
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(renderFrame);
      renderTask?.cancel();
    };
  }, [
    document,
    fit,
    hostSize.height,
    hostSize.width,
    page,
    rotation,
    thumbnail,
    zoom,
  ]);

  return (
    <div className="visual-canvas-host" ref={hostRef}>
      <div
        className="visual-canvas-sheet"
        style={{ height: renderSize.height, width: renderSize.width }}
      >
        <canvas aria-label={`Rendered page ${page}`} ref={canvasRef} />
        {highlight ? (
          <span
            aria-label="Selected change location"
            className="visual-highlight"
            style={{
              height: `${highlight.height * 100}%`,
              left: `${highlight.x * 100}%`,
              top: `${highlight.y * 100}%`,
              width: `${highlight.width * 100}%`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
});

function usePdfDocument(url: string): {
  document: PDFDocumentProxy | null;
  error: Error | null;
  loading: boolean;
} {
  const [state, setState] = useState<{
    document: PDFDocumentProxy | null;
    error: Error | null;
    loading: boolean;
    url: string;
  }>({ document: null, error: null, loading: true, url });

  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    void loadPdfRuntime()
      .then((runtime) => {
        if (!active) return;
        task = runtime.getDocument({
          disableAutoFetch: false,
          rangeChunkSize: 65_536,
          url,
        });
        return task.promise;
      })
      .then((document) => {
        if (active && document) {
          setState({ document, error: null, loading: false, url });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            document: null,
            error:
              error instanceof Error ? error : new Error('PDF load failed.'),
            loading: false,
            url,
          });
        }
      });
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [url]);
  return state.url === url
    ? state
    : { document: null, error: null, loading: true };
}

function ViewerMessage({
  icon,
  label,
}: {
  icon: 'error' | 'loading';
  label: string;
}) {
  const Icon = icon === 'loading' ? LoaderCircle : FileWarning;
  return (
    <div
      className="visual-viewer-message"
      role={icon === 'loading' ? 'status' : 'alert'}
    >
      <Icon
        aria-hidden="true"
        className={icon === 'loading' ? 'animate-spin' : ''}
        size={22}
      />
      <span>{label}</span>
    </div>
  );
}
