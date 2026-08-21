import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pdfMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getPage: vi.fn(),
  render: vi.fn(),
  scrollToIndex: vi.fn(),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 110,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 5) }, (_, index) => ({
        index,
        key: index,
        size: 110,
        start: index * 110,
      })),
    measureElement: vi.fn(),
    scrollToIndex: pdfMocks.scrollToIndex,
  }),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/pdf-worker.js',
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: pdfMocks.getDocument,
  GlobalWorkerOptions: { workerSrc: '' },
}));

import { PdfVersionViewer } from './PdfVersionViewer';

const document = {
  getPage: pdfMocks.getPage,
  numPages: 80,
};

beforeEach(() => {
  pdfMocks.destroy.mockReset();
  pdfMocks.getDocument.mockReset();
  pdfMocks.getPage.mockReset();
  pdfMocks.render.mockReset();
  pdfMocks.scrollToIndex.mockReset();
  pdfMocks.getDocument.mockReturnValue({
    destroy: pdfMocks.destroy,
    promise: Promise.resolve(document),
  });
  pdfMocks.getPage.mockResolvedValue({
    getViewport: ({ scale }: { scale: number }) => ({
      height: 800 * scale,
      width: 600 * scale,
    }),
    render: pdfMocks.render,
  });
  pdfMocks.render.mockReturnValue({
    cancel: vi.fn(),
    promise: Promise.resolve(),
  });

  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      disconnect() {}

      observe(target: Element) {
        this.callback(
          [
            {
              contentRect: {
                height: target.classList.contains('visual-thumbnail')
                  ? 78
                  : 600,
                width: target.classList.contains('visual-thumbnail') ? 62 : 800,
              },
              target,
            } as ResizeObserverEntry,
          ],
          this as unknown as globalThis.ResizeObserver,
        );
      }

      unobserve() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PdfVersionViewer', () => {
  it('renders only the virtual thumbnail window and reports a document once', async () => {
    const onPageChange = vi.fn();
    const onPageCount = vi.fn();
    const onViewerError = vi.fn();
    const onViewerLoaded = vi.fn();
    const { rerender, unmount } = render(
      <PdfVersionViewer
        filmstrip
        fit="page"
        onPageChange={onPageChange}
        onPageCount={onPageCount}
        onViewerError={onViewerError}
        onViewerLoaded={onViewerLoaded}
        page={1}
        rotation={0}
        title="Version 1"
        url="/version-1.pdf"
        zoom={1}
      />,
    );

    await screen.findByTestId('pdf-viewer-Version 1');
    expect(screen.getAllByRole('button', { name: /Page/u })).toHaveLength(5);
    expect(onPageCount).toHaveBeenCalledTimes(1);
    expect(onPageCount).toHaveBeenCalledWith(80);
    expect(onViewerLoaded).toHaveBeenCalledTimes(1);

    rerender(
      <PdfVersionViewer
        filmstrip
        fit="page"
        onPageChange={onPageChange}
        onPageCount={onPageCount}
        onViewerError={onViewerError}
        onViewerLoaded={onViewerLoaded}
        page={2}
        rotation={0}
        title="Version 1"
        url="/version-1.pdf"
        zoom={1}
      />,
    );

    expect(onPageCount).toHaveBeenCalledTimes(1);
    expect(onViewerLoaded).toHaveBeenCalledTimes(1);
    expect(pdfMocks.scrollToIndex).toHaveBeenLastCalledWith(1, {
      align: 'auto',
    });

    unmount();
    await waitFor(() => expect(pdfMocks.destroy).toHaveBeenCalledTimes(1));
  });
});
