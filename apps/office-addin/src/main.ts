import './styles.css';

import {
  captureExactOfficePackage,
  getExactCaptureSupport,
  type CapturedOfficePackage,
  type OfficeHost,
} from '@mergecom/office-core';
import {
  Download,
  FileCheck,
  RefreshCw,
  TriangleAlert,
  createIcons,
} from 'lucide';

import {
  detectOfficeRuntime,
  getOfficeSliceSize,
  type OfficeRuntime,
} from './office-runtime';

const rootElement = document.querySelector<HTMLElement>('#app');
if (rootElement === null)
  throw new Error('Office task pane root was not found.');
const root: HTMLElement = rootElement;

const HOST_LABELS: Readonly<Record<OfficeHost, string>> = {
  excel: 'Excel',
  powerpoint: 'PowerPoint',
  word: 'Word',
};

const DOCUMENT_LABELS: Readonly<Record<OfficeHost, string>> = {
  excel: 'workbook',
  powerpoint: 'presentation',
  word: 'document',
};

const PLATFORM_LABELS: Readonly<Record<OfficeRuntime['platform'], string>> = {
  android: 'Android',
  ios: 'iPad',
  mac: 'Mac',
  'office-online': 'Office on the web',
  pc: 'Windows',
  universal: 'Windows universal',
  unknown: 'Unknown platform',
};

void start().catch((error: unknown) => {
  renderStartupFailure(toErrorMessage(error));
});

async function start(): Promise<void> {
  renderLoading();
  const runtime = await detectOfficeRuntime();
  if (runtime === null) {
    renderBrowserPreview();
    return;
  }
  renderOfficeRuntime(runtime);
}

function renderLoading(): void {
  root.innerHTML = `
    ${brandMarkup()}
    <main class="content loading-state" aria-busy="true">
      <span class="spinner" aria-hidden="true"></span>
      <p>Connecting to Office...</p>
    </main>
  `;
}

function renderBrowserPreview(): void {
  const params = new URLSearchParams(window.location.search);
  const requestedHost = params.get('host');
  const host: OfficeHost =
    requestedHost === 'excel' || requestedHost === 'word'
      ? requestedHost
      : 'powerpoint';

  root.innerHTML = `
    ${brandMarkup()}
    <main class="content">
      <div class="context-line">
        <span>${HOST_LABELS[host].toUpperCase()}</span>
        <span class="mode-badge">Browser preview</span>
      </div>
      <h1>Open inside ${HOST_LABELS[host]}</h1>
      <p class="summary">Office host access is unavailable in this browser tab.</p>
      <section class="details" aria-label="Office connection">
        <div><span>Host</span><strong>${HOST_LABELS[host]}</strong></div>
        <div><span>Package access</span><strong>Unavailable</strong></div>
      </section>
      <button class="primary capture-button" type="button" disabled>
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        Capture current version
      </button>
      <p class="feedback" role="status">Waiting for an Office task pane.</p>
    </main>
  `;
  drawIcons();
}

function renderOfficeRuntime(runtime: OfficeRuntime): void {
  const support = getExactCaptureSupport(
    runtime.host,
    runtime.platform,
    runtime.compressedFileAvailable,
    runtime.fileName,
  );
  const supportReason =
    runtime.fileName === null
      ? `Save this ${DOCUMENT_LABELS[runtime.host]} before capturing it.`
      : support.supported
        ? null
        : support.reason;
  const canCapture = supportReason === null;
  const fileName =
    runtime.fileName ?? `Unsaved ${DOCUMENT_LABELS[runtime.host]}`;

  root.innerHTML = `
    ${brandMarkup()}
    <main class="content">
      <div class="context-line">
        <span>${HOST_LABELS[runtime.host].toUpperCase()}</span>
        <span class="mode-badge live">Office host</span>
      </div>
      <h1>${capitalize(DOCUMENT_LABELS[runtime.host])} connected</h1>
      <p class="summary file-name"></p>
      <section class="details" aria-label="Office connection">
        <div><span>Platform</span><strong>${PLATFORM_LABELS[runtime.platform]}</strong></div>
        <div><span>Package access</span><strong>${canCapture ? 'Exact OOXML' : 'Unavailable'}</strong></div>
      </section>
      <button class="primary capture-button" type="button" ${canCapture ? '' : 'disabled'}>
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        Capture current version
      </button>
      <div class="progress-region" hidden>
        <div><span>Reading Office file</span><strong class="progress-label">0%</strong></div>
        <progress value="0" max="100">0%</progress>
      </div>
      <section class="capture-result" aria-label="Captured package" hidden>
        <div class="result-heading">
          <i data-lucide="file-check" aria-hidden="true"></i>
          <div><span>READY</span><strong>Exact package captured</strong></div>
        </div>
        <dl>
          <div><dt>Size</dt><dd class="result-size"></dd></div>
          <div><dt>SHA-256</dt><dd class="result-hash"></dd></div>
        </dl>
        <button class="download-button" type="button">
          <i data-lucide="download" aria-hidden="true"></i>
          Download captured copy
        </button>
      </section>
      <p class="feedback ${canCapture ? '' : 'warning'}" role="status" aria-live="polite"></p>
    </main>
  `;

  const fileNameElement = getElement<HTMLElement>('.file-name');
  const feedback = getElement<HTMLElement>('.feedback');
  const captureButton = getElement<HTMLButtonElement>('.capture-button');
  const downloadButton = getElement<HTMLButtonElement>('.download-button');
  const progressRegion = getElement<HTMLElement>('.progress-region');
  const progress = getElement<HTMLProgressElement>('progress');
  const progressLabel = getElement<HTMLElement>('.progress-label');
  const resultRegion = getElement<HTMLElement>('.capture-result');
  const resultSize = getElement<HTMLElement>('.result-size');
  const resultHash = getElement<HTMLElement>('.result-hash');
  let capturedPackage: CapturedOfficePackage | null = null;

  fileNameElement.textContent = fileName;
  feedback.textContent =
    supportReason ?? 'Ready to capture the saved Office file.';
  captureButton.addEventListener('click', () => {
    if (!canCapture || runtime.fileName === null) return;
    captureButton.disabled = true;
    resultRegion.hidden = true;
    progressRegion.hidden = false;
    progress.value = 0;
    progress.textContent = '0%';
    progressLabel.textContent = '0%';
    feedback.classList.remove('warning');
    feedback.textContent = 'Reading the exact Office package...';

    void captureExactOfficePackage(runtime.provider, {
      fileName: runtime.fileName,
      host: runtime.host,
      onProgress: ({ bytesCaptured, totalBytes }) => {
        const percent = Math.min(
          100,
          Math.round((bytesCaptured / totalBytes) * 100),
        );
        progress.value = percent;
        progress.textContent = `${percent}%`;
        progressLabel.textContent = `${percent}%`;
      },
      sliceSize: getOfficeSliceSize(runtime.platform),
    })
      .then((capture) => {
        capturedPackage = capture;
        progressRegion.hidden = true;
        resultSize.textContent = formatBytes(capture.descriptor.contentLength);
        resultHash.textContent = capture.descriptor.sha256;
        resultRegion.hidden = false;
        feedback.textContent = 'The captured bytes are ready.';
        window.dispatchEvent(
          new CustomEvent('mergecom:office-package-captured', {
            detail: capture,
          }),
        );
      })
      .catch((error: unknown) => {
        progressRegion.hidden = true;
        feedback.classList.add('warning');
        feedback.textContent = toErrorMessage(error);
      })
      .finally(() => {
        captureButton.disabled = false;
      });
  });

  downloadButton.addEventListener('click', () => {
    if (capturedPackage === null) return;
    downloadCapturedPackage(capturedPackage);
  });

  drawIcons();
}

function renderStartupFailure(message: string): void {
  root.innerHTML = `
    ${brandMarkup()}
    <main class="content">
      <div class="context-line"><span>OFFICE</span></div>
      <h1>Connection failed</h1>
      <div class="error-state">
        <i data-lucide="triangle-alert" aria-hidden="true"></i>
        <p class="feedback warning" role="alert"></p>
      </div>
    </main>
  `;
  getElement<HTMLElement>('.feedback').textContent = message;
  drawIcons();
}

function brandMarkup(): string {
  return `
    <header class="brand">
      <span class="brand-mark" aria-hidden="true">M</span>
      <strong>MergeCom</strong>
    </header>
  `;
}

function drawIcons(): void {
  createIcons({
    icons: { Download, FileCheck, RefreshCw, TriangleAlert },
    root,
  });
}

function downloadCapturedPackage(capture: CapturedOfficePackage): void {
  const bytes = new Uint8Array(capture.bytes).buffer;
  const blob = new Blob([bytes], { type: capture.descriptor.mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = capture.descriptor.fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getElement<T extends Element>(selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null)
    throw new Error(`Missing task pane element: ${selector}`);
  return element;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Office package capture failed.';
}
