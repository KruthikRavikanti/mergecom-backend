import './styles.css';

import {
  captureExactOfficePackage,
  getExactCaptureSupport,
  verifyExactOfficePackage,
  type CapturedOfficePackage,
  type OfficeHost,
} from '@mergecom/office-core';
import {
  CircleCheck,
  Download,
  ExternalLink,
  FolderOpen,
  History,
  Link2,
  LogIn,
  Plus,
  RefreshCw,
  TriangleAlert,
  Unlink,
  Upload,
  X,
  createIcons,
} from 'lucide';

import {
  OfficeApi,
  type BoundDocumentState,
  type CurrentUser,
  type DocumentChoice,
  type DocumentVersion,
  type DownloadGrant,
  type Project,
  type VersionComparison,
  webAppUrl,
} from './api';
import { createBaseContextStore, type KeyValueStorage } from './base-context';
import { downloadBlob } from './blob-download';
import { resolveBrowserGrantUrl, uploadBlob } from './blob-upload';
import { documentKindForHost, type DocumentBinding } from './document-binding';
import {
  detectOfficeRuntime,
  getOfficeSliceSize,
  type OfficeRuntime,
} from './office-runtime';
import { pushCapturedVersion, type PushStage } from './push-version';
import {
  comparisonReviewPath,
  createSaveCompareWorkflowStore,
  type SaveCompareWorkflow,
} from './save-and-compare';

const rootElement = document.querySelector<HTMLElement>('#app');
if (rootElement === null)
  throw new Error('Office task pane root was not found.');
const root: HTMLElement = rootElement;
const api = new OfficeApi();
const baseContexts = createBaseContextStore(browserStorage());
const saveCompareWorkflows = createSaveCompareWorkflowStore(browserStorage());

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
const ACTIVE_PROCESSING_STATES = new Set([
  'queued',
  'retryable_failed',
  'running',
]);

void start().catch((error: unknown) => {
  renderStartupFailure(toErrorMessage(error));
});

async function start(): Promise<void> {
  renderLoading('Connecting to Office...');
  const runtime = await detectOfficeRuntime();
  if (runtime === null) {
    renderBrowserPreview();
    return;
  }
  const support = getExactCaptureSupport(
    runtime.host,
    runtime.platform,
    runtime.compressedFileAvailable,
    runtime.fileName,
  );
  const supportReason =
    runtime.fileName === null
      ? `Save this ${DOCUMENT_LABELS[runtime.host]} before linking it.`
      : support.supported
        ? null
        : support.reason;
  if (supportReason !== null) {
    renderUnsupported(runtime, supportReason);
    return;
  }

  renderLoading('Checking MergeCom session...');
  const user = await api.currentUser();
  if (user === null) {
    renderSignedOut(runtime);
    return;
  }
  if (!user.activeOrganization || user.activeOrganization.status !== 'active') {
    renderWorkspaceUnavailable(runtime, user);
    return;
  }

  const binding = runtime.bindingStore.load();
  if (binding === null) {
    await renderBindingPicker(runtime, user);
    return;
  }
  if (
    binding.organizationId !== user.activeOrganization.id ||
    binding.documentKind !== documentKindForHost(runtime.host)
  ) {
    await renderBindingPicker(
      runtime,
      user,
      'The saved link does not match this Office file or active workspace.',
    );
    return;
  }
  try {
    const state = await api.boundDocumentState(binding);
    await renderBoundDocument(runtime, user, binding, state);
    const workflow = saveCompareWorkflows.load(binding);
    if (workflow) {
      await continueSaveCompare(runtime, user, binding, workflow);
    }
  } catch (error) {
    await renderBindingPicker(runtime, user, toErrorMessage(error));
  }
}

function renderLoading(label: string): void {
  root.innerHTML = `
    ${brandMarkup()}
    <main class="content loading-state" aria-busy="true">
      <span class="spinner" aria-hidden="true"></span>
      <p>${escapeHtml(label)}</p>
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
      ${contextMarkup(host, 'Browser preview')}
      <h1>Open inside ${HOST_LABELS[host]}</h1>
      <p class="summary">Office host access is unavailable in this browser tab.</p>
      <section class="details" aria-label="Office connection">
        <div><span>Host</span><strong>${HOST_LABELS[host]}</strong></div>
        <div><span>Package access</span><strong>Unavailable</strong></div>
      </section>
      <button class="primary" type="button" disabled>
        <i data-lucide="upload" aria-hidden="true"></i>Save &amp; Compare
      </button>
      <p class="feedback" role="status">Waiting for an Office task pane.</p>
    </main>
  `;
  drawIcons();
}

function renderUnsupported(runtime: OfficeRuntime, reason: string): void {
  const label = capitalize(DOCUMENT_LABELS[runtime.host]);
  root.innerHTML = `
    ${brandMarkup()}
    <main class="content">
      ${contextMarkup(runtime.host, 'Office host', true)}
      <h1>${label} connected</h1>
      <p class="summary">${escapeHtml(runtime.fileName ?? `Unsaved ${DOCUMENT_LABELS[runtime.host]}`)}</p>
      <section class="details" aria-label="Office connection">
        <div><span>Platform</span><strong>${PLATFORM_LABELS[runtime.platform]}</strong></div>
        <div><span>Package access</span><strong>Unavailable</strong></div>
      </section>
      <button class="primary" type="button" disabled>
        <i data-lucide="upload" aria-hidden="true"></i>Save &amp; Compare
      </button>
      <p class="feedback warning" role="status">${escapeHtml(reason)}</p>
    </main>
  `;
  drawIcons();
}

function renderSignedOut(runtime: OfficeRuntime): void {
  root.innerHTML = `
    ${brandMarkup()}
    <main class="content">
      ${contextMarkup(runtime.host, 'Office host', true)}
      <h1>Sign in to MergeCom</h1>
      <p class="summary">${escapeHtml(runtime.fileName ?? '')}</p>
      <section class="status-band" aria-label="Identity">
        <span>IDENTITY</span><strong>Signed out</strong>
      </section>
      <button class="primary sign-in-button" type="button">
        <i data-lucide="log-in" aria-hidden="true"></i>Sign in
      </button>
      <button class="secondary retry-button" type="button">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>Retry session
      </button>
      <p class="feedback" role="status"></p>
    </main>
  `;
  const feedback = getElement<HTMLElement>('.feedback');
  getElement<HTMLButtonElement>('.sign-in-button').addEventListener(
    'click',
    () => {
      const button = getElement<HTMLButtonElement>('.sign-in-button');
      button.disabled = true;
      feedback.classList.remove('warning');
      feedback.textContent = 'Opening secure sign-in...';
      void runtime
        .requestAuthentication(
          new URL('/office-auth.html', window.location.origin).href,
        )
        .then((code) => api.exchangeOfficeSession(code))
        .then(() => start())
        .catch((error: unknown) => {
          button.disabled = false;
          feedback.classList.add('warning');
          feedback.textContent = toErrorMessage(error);
        });
    },
  );
  getElement<HTMLButtonElement>('.retry-button').addEventListener(
    'click',
    () => {
      void start();
    },
  );
  drawIcons();
}

function renderWorkspaceUnavailable(
  runtime: OfficeRuntime,
  user: CurrentUser,
): void {
  root.innerHTML = `
    ${brandMarkup()}
    <main class="content">
      ${contextMarkup(runtime.host, 'Office host', true)}
      <h1>Workspace unavailable</h1>
      <p class="summary">${escapeHtml(user.user.displayName)}</p>
      <p class="feedback warning" role="alert">Select an active workspace in MergeCom, then retry.</p>
      <button class="primary open-web-button" type="button">
        <i data-lucide="external-link" aria-hidden="true"></i>Open MergeCom
      </button>
      <button class="secondary retry-button" type="button">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>Retry
      </button>
    </main>
  `;
  getElement<HTMLButtonElement>('.open-web-button').addEventListener(
    'click',
    () => runtime.openBrowserWindow(webAppUrl('/app')),
  );
  getElement<HTMLButtonElement>('.retry-button').addEventListener(
    'click',
    () => {
      void start();
    },
  );
  drawIcons();
}

async function renderBindingPicker(
  runtime: OfficeRuntime,
  user: CurrentUser,
  warning?: string,
): Promise<void> {
  const organization = user.activeOrganization;
  if (!organization) return;
  renderLoading('Loading MergeCom documents...');
  let projects: Project[];
  try {
    projects = await api.listProjects(organization.id);
  } catch (error) {
    renderRetryableFailure(runtime, toErrorMessage(error));
    return;
  }

  const canCreateProject = ['owner', 'admin', 'project_lead'].includes(
    organization.role,
  );
  root.innerHTML = `
    ${brandMarkup()}
    <main class="content">
      ${contextMarkup(runtime.host, 'Office host', true)}
      <h1>Link ${DOCUMENT_LABELS[runtime.host]}</h1>
      <p class="summary">${escapeHtml(runtime.fileName ?? '')}</p>
      ${identityMarkup(user)}
      <form class="binding-form">
        <label for="project">Project</label>
        <select id="project" name="project" ${projects.length === 0 ? 'disabled' : ''}>
          ${projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join('')}
        </select>
        ${
          canCreateProject
            ? `
          <button class="inline-action new-project-button" type="button">
            <i data-lucide="plus" aria-hidden="true"></i>New project
          </button>
          <div class="creation-fields project-creation" hidden>
            <label for="new-project-name">Project name</label>
            <input id="new-project-name" maxlength="160" autocomplete="off" />
            <button class="secondary create-project-button" type="button">Create project</button>
          </div>
        `
            : ''
        }
        <label for="document">Document</label>
        <select id="document" name="document" disabled>
          <option value="">Loading documents...</option>
        </select>
        <button class="inline-action new-document-button" type="button" disabled>
          <i data-lucide="plus" aria-hidden="true"></i>New ${DOCUMENT_LABELS[runtime.host]}
        </button>
        <div class="creation-fields document-creation" hidden>
          <label for="new-document-name">Document name</label>
          <input id="new-document-name" maxlength="255" value="${escapeHtml(defaultDocumentName(runtime.fileName))}" autocomplete="off" />
          <label for="new-document-folder">Folder</label>
          <select id="new-document-folder">
            <option value="">Project root</option>
          </select>
          <button class="secondary create-document-button" type="button">Create and link</button>
        </div>
        <button class="primary bind-button" type="submit" disabled>
          <i data-lucide="link-2" aria-hidden="true"></i>Link current file
        </button>
      </form>
      ${progressMarkup()}
      <p class="feedback ${warning ? 'warning' : ''}" role="status" aria-live="polite">${escapeHtml(warning ?? (projects.length === 0 ? 'No accessible projects are available.' : ''))}</p>
    </main>
  `;
  drawIcons();
  const projectSelect = getElement<HTMLSelectElement>('#project');
  const documentSelect = getElement<HTMLSelectElement>('#document');
  const bindButton = getElement<HTMLButtonElement>('.bind-button');
  const form = getElement<HTMLFormElement>('.binding-form');
  const feedback = getElement<HTMLElement>('.feedback');
  const newDocumentButton = getElement<HTMLButtonElement>(
    '.new-document-button',
  );
  const documentCreation = getElement<HTMLElement>('.document-creation');
  const documentName = getElement<HTMLInputElement>('#new-document-name');
  const folderSelect = getElement<HTMLSelectElement>('#new-document-folder');
  const createDocumentButton = getElement<HTMLButtonElement>(
    '.create-document-button',
  );
  let documents: DocumentChoice[] = [];

  const loadDocuments = async () => {
    documentSelect.disabled = true;
    bindButton.disabled = true;
    documentSelect.innerHTML = '<option value="">Loading documents...</option>';
    feedback.classList.remove('warning');
    feedback.textContent = '';
    if (!projectSelect.value) {
      documentSelect.innerHTML =
        '<option value="">Select a project first</option>';
      newDocumentButton.disabled = true;
      return;
    }
    try {
      const [loadedDocuments, folders] = await Promise.all([
        api.listDocuments(
          organization.id,
          projectSelect.value,
          documentKindForHost(runtime.host),
        ),
        api.listFolders(organization.id, projectSelect.value),
      ]);
      documents = loadedDocuments;
      folderSelect.innerHTML = [
        '<option value="">Project root</option>',
        ...folders.map(
          (folder) =>
            `<option value="${folder.id}">${escapeHtml(folder.path)}</option>`,
        ),
      ].join('');
      documentSelect.innerHTML = documents.length
        ? documents
            .map((document) => {
              const path = document.folderPath
                ? `${document.folderPath} / ${document.name}`
                : document.name;
              return `<option value="${document.id}">${escapeHtml(path)}</option>`;
            })
            .join('')
        : '<option value="">No matching documents</option>';
      documentSelect.disabled = documents.length === 0;
      bindButton.disabled = documents.length === 0;
      const project = projects.find(
        (candidate) => candidate.id === projectSelect.value,
      );
      newDocumentButton.disabled =
        !project ||
        !['contributor', 'project_lead'].includes(project.accessRole);
    } catch (error) {
      documentSelect.innerHTML =
        '<option value="">Documents unavailable</option>';
      feedback.classList.add('warning');
      feedback.textContent = toErrorMessage(error);
    }
  };

  projectSelect.addEventListener('change', () => void loadDocuments());
  newDocumentButton.addEventListener('click', () => {
    documentCreation.hidden = !documentCreation.hidden;
    if (!documentCreation.hidden) documentName.focus();
  });
  createDocumentButton.addEventListener('click', () => {
    const name = documentName.value.trim();
    if (!name || !projectSelect.value || runtime.fileName === null) return;
    createDocumentButton.disabled = true;
    feedback.classList.remove('warning');
    feedback.textContent = 'Creating and linking the document...';
    void api
      .createDocument({
        csrfToken: user.session.csrfToken,
        documentKind: documentKindForHost(runtime.host),
        folderId: folderSelect.value || null,
        name,
        organizationId: organization.id,
        projectId: projectSelect.value,
      })
      .then((document) => {
        const binding: DocumentBinding = {
          documentId: document.id,
          documentKind: document.kind,
          organizationId: organization.id,
          projectId: projectSelect.value,
          schemaVersion: 1,
        };
        return bindCurrentFile(runtime, user, binding, form, feedback);
      })
      .catch((error: unknown) => {
        createDocumentButton.disabled = false;
        feedback.classList.add('warning');
        feedback.textContent = toErrorMessage(error);
      });
  });
  if (canCreateProject) {
    const projectCreation = getElement<HTMLElement>('.project-creation');
    const projectName = getElement<HTMLInputElement>('#new-project-name');
    const createProjectButton = getElement<HTMLButtonElement>(
      '.create-project-button',
    );
    getElement<HTMLButtonElement>('.new-project-button').addEventListener(
      'click',
      () => {
        projectCreation.hidden = !projectCreation.hidden;
        if (!projectCreation.hidden) projectName.focus();
      },
    );
    createProjectButton.addEventListener('click', () => {
      const name = projectName.value.trim();
      if (!name) return;
      createProjectButton.disabled = true;
      feedback.classList.remove('warning');
      feedback.textContent = 'Creating project...';
      void api
        .createProject(organization.id, name, user.session.csrfToken)
        .then(async (project) => {
          projects = [...projects, project];
          projectSelect.disabled = false;
          projectSelect.innerHTML = projects
            .map(
              (candidate) =>
                `<option value="${candidate.id}">${escapeHtml(candidate.name)}</option>`,
            )
            .join('');
          projectSelect.value = project.id;
          projectCreation.hidden = true;
          feedback.textContent =
            'Project created. Select or create a document.';
          await loadDocuments();
        })
        .catch((error: unknown) => {
          feedback.classList.add('warning');
          feedback.textContent = toErrorMessage(error);
        })
        .finally(() => {
          createProjectButton.disabled = false;
        });
    });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const document = documents.find(
      (candidate) => candidate.id === documentSelect.value,
    );
    if (!document || runtime.fileName === null) return;
    const binding: DocumentBinding = {
      documentId: document.id,
      documentKind: document.kind,
      organizationId: organization.id,
      projectId: projectSelect.value,
      schemaVersion: 1,
    };
    void bindCurrentFile(runtime, user, binding, form, feedback);
  });
  await loadDocuments();
}

async function bindCurrentFile(
  runtime: OfficeRuntime,
  user: CurrentUser,
  binding: DocumentBinding,
  form: HTMLFormElement,
  feedback: HTMLElement,
): Promise<void> {
  const controls = [...form.elements].filter(
    (element): element is HTMLButtonElement | HTMLSelectElement =>
      element instanceof HTMLButtonElement ||
      element instanceof HTMLSelectElement,
  );
  controls.forEach((control) => {
    control.disabled = true;
  });
  feedback.classList.remove('warning');
  feedback.textContent = 'Reading the exact Office package...';
  showProgress('Reading Office file', 0);
  try {
    const capture = await capturePackage(runtime, (percent) => {
      showProgress('Reading Office file', percent);
    });
    const state = await api.boundDocumentState(binding);
    const match = state.versions.find(
      (version) => version.artifact.sha256 === capture.descriptor.sha256,
    );
    await runtime.bindingStore.save(binding);
    await baseContexts.save(binding, runtime.documentUrl, {
      baseVersionId: match?.id ?? null,
      schemaVersion: 1,
    });
    await renderBoundDocument(
      runtime,
      user,
      binding,
      state,
      match
        ? `Linked to ${versionLabel(match)}.`
        : state.branch.headVersionId
          ? 'Linked without a verified base. The first push will be preserved as a conflict.'
          : 'Linked for the first version.',
    );
  } catch (error) {
    hideProgress();
    controls.forEach((control) => {
      control.disabled = false;
    });
    feedback.classList.add('warning');
    feedback.textContent = toErrorMessage(error);
  }
}

async function renderBoundDocument(
  runtime: OfficeRuntime,
  user: CurrentUser,
  binding: DocumentBinding,
  state: BoundDocumentState,
  banner = '',
): Promise<void> {
  const baseContext = await baseContexts.load(binding, runtime.documentUrl);
  const baseVersion = state.versions.find(
    (version) => version.id === baseContext?.baseVersionId,
  );
  const headVersion = state.versions.find(
    (version) => version.id === state.branch.headVersionId,
  );
  const canPush = ['contributor', 'project_lead'].includes(
    state.project.accessRole,
  );
  const status = baseStatus(baseVersion, headVersion);
  const selectedVersion = headVersion ?? state.versions[0];
  const selectedOpenSupport = selectedVersion
    ? versionOpenSupport(runtime, selectedVersion)
    : {
        reason: 'This document does not have any versions yet.',
        supported: false as const,
      };
  root.innerHTML = `
    ${brandMarkup()}
    <main class="content">
      ${contextMarkup(runtime.host, 'Office host', true)}
      <h1>${escapeHtml(state.document.name)}</h1>
      <p class="summary">${escapeHtml(runtime.fileName ?? '')}</p>
      ${identityMarkup(user)}
      <section class="linked-document" aria-label="Linked MergeCom document">
        <div class="section-title"><i data-lucide="link-2" aria-hidden="true"></i><span>LINKED DOCUMENT</span></div>
        <strong>${escapeHtml(state.project.name)}</strong>
        <span>${escapeHtml(state.document.name)}</span>
      </section>
      <section class="version-status" aria-label="Version status">
        <div><span>Latest</span><strong>${headVersion ? versionLabel(headVersion) : 'No versions'}</strong></div>
        <div><span>File base</span><strong>${baseVersion ? versionLabel(baseVersion) : 'Unverified'}</strong></div>
        <div><span>Status</span><strong class="${status.warning ? 'warning-text' : ''}">${status.label}</strong></div>
        ${headVersion ? `<div><span>Processing</span><strong>${processingLabel(headVersion)}</strong></div>` : ''}
      </section>
      <section class="version-retrieval" aria-label="Version retrieval">
        <div class="section-title"><i data-lucide="history" aria-hidden="true"></i><span>VERSION RETRIEVAL</span></div>
        <label for="pull-version">Version</label>
        <select id="pull-version" name="version" ${selectedVersion ? '' : 'disabled'}>
          ${
            state.versions
              .map(
                (version) =>
                  `<option value="${version.id}" ${version.id === selectedVersion?.id ? 'selected' : ''}>${escapeHtml(versionOptionLabel(version))}</option>`,
              )
              .join('') || '<option value="">No versions</option>'
          }
        </select>
        <div class="retrieval-details">
          <span class="retrieval-file">${escapeHtml(selectedVersion?.artifact.originalFilename ?? '')}</span>
          <span class="retrieval-size">${selectedVersion ? formatBytes(selectedVersion.artifact.byteSize) : ''}</span>
        </div>
        <div class="retrieval-actions">
          <button class="secondary open-copy-button" type="button" ${selectedOpenSupport.supported ? '' : 'disabled'}>
            <i data-lucide="folder-open" aria-hidden="true"></i>Open exact copy
          </button>
          <button class="secondary download-version-button" type="button" ${selectedVersion ? '' : 'disabled'}>
            <i data-lucide="download" aria-hidden="true"></i>Download
          </button>
        </div>
        <p class="retrieval-hint">${escapeHtml(selectedOpenSupport.supported ? 'Opens a separate Office file. The current file is not replaced.' : selectedOpenSupport.reason)}</p>
      </section>
      <form class="push-form">
        <label for="version-note">Version note</label>
        <textarea id="version-note" name="note" maxlength="500" rows="3" placeholder="Optional context for reviewers" ${canPush ? '' : 'disabled'}></textarea>
        <div class="character-count"><span>Optional</span><span class="note-count">0 / 500</span></div>
        <label for="comparison-baseline">Compare with</label>
        <select id="comparison-baseline" ${canPush ? '' : 'disabled'}>
          <option value="">Recommended baseline</option>
          ${state.versions
            .filter(
              (version) =>
                version.processing.state === 'completed' &&
                (version.status === 'ready' || version.status === 'conflicted'),
            )
            .map(
              (version) =>
                `<option value="${version.id}">${escapeHtml(versionLabel(version))} - ${escapeHtml(version.author.name)}</option>`,
            )
            .join('')}
        </select>
        <button class="primary push-button" type="submit" ${canPush ? '' : 'disabled'}>
          <i data-lucide="upload" aria-hidden="true"></i>Save &amp; Compare
        </button>
      </form>
      ${progressMarkup(true)}
      <section class="push-result" aria-live="polite" hidden></section>
      <div class="pane-actions">
        <button class="icon-text open-web-button" type="button">
          <i data-lucide="external-link" aria-hidden="true"></i>Open in MergeCom
        </button>
        <button class="icon-text unlink-button" type="button">
          <i data-lucide="unlink" aria-hidden="true"></i>Change link
        </button>
      </div>
      <p class="feedback ${status.warning ? 'warning' : ''}" role="status">${escapeHtml(banner || status.message || (!canPush ? 'Your project role cannot push versions.' : ''))}</p>
    </main>
  `;
  drawIcons();

  const form = getElement<HTMLFormElement>('.push-form');
  const note = getElement<HTMLTextAreaElement>('#version-note');
  const count = getElement<HTMLElement>('.note-count');
  const pushButton = getElement<HTMLButtonElement>('.push-button');
  const comparisonBaseline = getElement<HTMLSelectElement>(
    '#comparison-baseline',
  );
  const versionSelect = getElement<HTMLSelectElement>('#pull-version');
  const openCopyButton = getElement<HTMLButtonElement>('.open-copy-button');
  const downloadVersionButton = getElement<HTMLButtonElement>(
    '.download-version-button',
  );
  const retrievalFile = getElement<HTMLElement>('.retrieval-file');
  const retrievalSize = getElement<HTMLElement>('.retrieval-size');
  const retrievalHint = getElement<HTMLElement>('.retrieval-hint');
  const getSelectedVersion = () =>
    state.versions.find((version) => version.id === versionSelect.value);
  const updateRetrieval = () => {
    const version = getSelectedVersion();
    retrievalFile.textContent = version?.artifact.originalFilename ?? '';
    retrievalSize.textContent = version
      ? formatBytes(version.artifact.byteSize)
      : '';
    downloadVersionButton.disabled = version === undefined;
    if (!version) {
      openCopyButton.disabled = true;
      retrievalHint.textContent =
        'This document does not have any versions yet.';
      return;
    }
    const support = versionOpenSupport(runtime, version);
    openCopyButton.disabled = !support.supported;
    retrievalHint.textContent = support.supported
      ? 'Opens a separate Office file. The current file is not replaced.'
      : support.reason;
  };
  versionSelect.addEventListener('change', updateRetrieval);
  openCopyButton.addEventListener('click', () => {
    const version = getSelectedVersion();
    if (version) {
      void openVersionCopy(runtime, user, binding, version);
    }
  });
  downloadVersionButton.addEventListener('click', () => {
    const version = getSelectedVersion();
    if (version) {
      void downloadVersion(runtime, user, binding, version);
    }
  });
  note.addEventListener('input', () => {
    count.textContent = `${note.value.length} / 500`;
    pushButton.disabled = !canPush;
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!canPush) return;
    void pushCurrentVersion(
      runtime,
      user,
      binding,
      state,
      note.value.trim() || 'Saved from the Office add-in',
      comparisonBaseline.value || null,
    );
  });
  getElement<HTMLButtonElement>('.open-web-button').addEventListener(
    'click',
    () => runtime.openBrowserWindow(documentHistoryUrl(binding)),
  );
  getElement<HTMLButtonElement>('.unlink-button').addEventListener(
    'click',
    () => {
      void (async () => {
        await runtime.bindingStore.clear();
        await baseContexts.clear(binding, runtime.documentUrl);
        saveCompareWorkflows.clear(binding);
        await renderBindingPicker(runtime, user);
      })().catch((error: unknown) =>
        renderStartupFailure(toErrorMessage(error)),
      );
    },
  );
}

async function pushCurrentVersion(
  runtime: OfficeRuntime,
  user: CurrentUser,
  binding: DocumentBinding,
  state: BoundDocumentState,
  note: string,
  explicitBaselineVersionId: string | null,
): Promise<void> {
  const controller = new AbortController();
  const form = getElement<HTMLFormElement>('.push-form');
  const restoreActions = disablePaneActions();
  const feedback = getElement<HTMLElement>('.feedback');
  form.setAttribute('aria-busy', 'true');
  feedback.classList.remove('warning');
  feedback.textContent = 'Reading the exact Office package...';
  showProgress('Reading Office file', 0, controller);

  try {
    const capture = await capturePackage(
      runtime,
      (percent) =>
        showProgress('Reading Office file', percent * 0.4, controller),
      controller.signal,
    );
    const duplicate = state.versions.find(
      (version) => version.artifact.sha256 === capture.descriptor.sha256,
    );
    if (duplicate) {
      await baseContexts.save(binding, runtime.documentUrl, {
        baseVersionId: duplicate.id,
        schemaVersion: 1,
      });
      await renderBoundDocument(
        runtime,
        user,
        binding,
        state,
        duplicate.id === state.branch.headVersionId
          ? `${versionLabel(duplicate)} already contains these exact bytes.`
          : `${versionLabel(duplicate)} contains these exact bytes and is behind latest.`,
      );
      const versionSelect =
        root.querySelector<HTMLSelectElement>('#pull-version');
      if (versionSelect) {
        versionSelect.value = duplicate.id;
        versionSelect.dispatchEvent(new Event('change'));
      }
      return;
    }
    const storedBase = await baseContexts.load(binding, runtime.documentUrl);
    const validBase = state.versions.some(
      (version) => version.id === storedBase?.baseVersionId,
    )
      ? (storedBase?.baseVersionId ?? null)
      : null;
    const result = await pushCapturedVersion({
      api,
      baseVersionId: validBase,
      binding,
      capture,
      csrfToken: user.session.csrfToken,
      note,
      onProgress: ({ loaded, total }) => {
        const percent = total > 0 ? loaded / total : 0;
        showProgress('Uploading exact package', 40 + percent * 50, controller);
      },
      onStage: (stage) => showPushStage(stage, controller),
      signal: controller.signal,
      upload: uploadBlob,
    });
    if (result.outcome === 'created') {
      await baseContexts.save(binding, runtime.documentUrl, {
        baseVersionId: result.version.id,
        schemaVersion: 1,
      });
    }
    showPushResult(result.version, result.outcome);
    const workflow: SaveCompareWorkflow = {
      baselineVersionId: explicitBaselineVersionId,
      comparisonId: null,
      schemaVersion: 1,
      stage: 'processing_version',
      targetVersionId: result.version.id,
      verifiedBaseVersionId: validBase,
    };
    saveCompareWorkflows.save(binding, workflow);
    await continueSaveCompare(runtime, user, binding, workflow);
  } catch (error) {
    hideProgress();
    form.removeAttribute('aria-busy');
    restoreActions();
    feedback.classList.add('warning');
    feedback.textContent = toErrorMessage(error);
  }
}

async function continueSaveCompare(
  runtime: OfficeRuntime,
  user: CurrentUser,
  binding: DocumentBinding,
  workflow: SaveCompareWorkflow,
): Promise<void> {
  try {
    let comparison = workflow.comparisonId
      ? await api.comparison(binding, workflow.comparisonId)
      : null;
    const version = await pollProcessing(binding, workflow.targetVersionId);
    if (ACTIVE_PROCESSING_STATES.has(version.processing.state)) {
      saveCompareWorkflows.save(binding, {
        ...workflow,
        stage: 'retryable_failure',
      });
      await renderWorkflowStatus(
        runtime,
        user,
        binding,
        `${versionLabel(version)} is still processing. MergeCom will resume when the pane opens again.`,
        true,
      );
      return;
    }
    if (
      version.status === 'quarantined' ||
      version.processing.state === 'quarantined'
    ) {
      saveCompareWorkflows.save(binding, { ...workflow, stage: 'quarantined' });
      await renderWorkflowStatus(
        runtime,
        user,
        binding,
        `${versionLabel(version)} was quarantined and was not compared.`,
        true,
      );
      return;
    }
    if (
      version.status === 'failed' ||
      version.processing.state === 'permanently_failed'
    ) {
      saveCompareWorkflows.save(binding, {
        ...workflow,
        stage: 'terminal_failure',
      });
      await renderWorkflowStatus(
        runtime,
        user,
        binding,
        `${versionLabel(version)} could not be processed and was not compared.`,
        true,
      );
      return;
    }

    let baselineVersionId = workflow.baselineVersionId;
    let baselineReason = baselineVersionId
      ? 'Selected before saving'
      : 'No eligible baseline';
    if (!baselineVersionId && !comparison) {
      showProgress('Selecting comparison baseline', 97);
      const recommendation = await api.recommendBaseline(
        binding,
        version.id,
        workflow.verifiedBaseVersionId,
      );
      baselineVersionId = recommendation.baseline?.id ?? null;
      baselineReason = baselineReasonLabel(recommendation.reason);
    }
    if (baselineVersionId === version.id) baselineVersionId = null;
    if (!baselineVersionId && !comparison) {
      const refreshed = await api.boundDocumentState(binding);
      await renderBoundDocument(
        runtime,
        user,
        binding,
        refreshed,
        `${versionLabel(version)} was saved. There is no eligible earlier version to compare.`,
      );
      showComparisonCompletion(runtime, binding, version, null, baselineReason);
      saveCompareWorkflows.save(binding, {
        ...workflow,
        baselineVersionId: null,
        stage: 'ready_for_review',
      });
      return;
    }

    if (!comparison && baselineVersionId) {
      showProgress('Creating comparison', 98);
      comparison = await api.createComparison({
        baseVersionId: baselineVersionId,
        binding,
        csrfToken: user.session.csrfToken,
        targetVersionId: version.id,
      });
      workflow = {
        ...workflow,
        baselineVersionId,
        comparisonId: comparison.id,
        stage: 'processing_comparison',
      };
      saveCompareWorkflows.save(binding, workflow);
    }
    if (!comparison) return;
    comparison = await pollComparison(binding, comparison.id);
    const refreshed = await api.boundDocumentState(binding);
    await renderBoundDocument(
      runtime,
      user,
      binding,
      refreshed,
      comparison.state === 'completed'
        ? `${versionLabel(version)} was saved and compared successfully.`
        : `${versionLabel(version)} was saved, but comparison processing did not complete.`,
    );
    if (comparison.state === 'completed') {
      saveCompareWorkflows.save(binding, {
        ...workflow,
        stage: 'ready_for_review',
      });
      showComparisonCompletion(
        runtime,
        binding,
        version,
        comparison,
        baselineReason,
      );
    } else {
      const feedback = getElement<HTMLElement>('.feedback');
      feedback.classList.add('warning');
    }
  } catch (error) {
    const state = await api.boundDocumentState(binding).catch(() => null);
    if (state) await renderBoundDocument(runtime, user, binding, state);
    const feedback = root.querySelector<HTMLElement>('.feedback');
    if (feedback) {
      feedback.classList.add('warning');
      feedback.textContent = `Save completed, but comparison could not continue: ${toErrorMessage(error)}`;
    }
    saveCompareWorkflows.save(binding, {
      ...workflow,
      stage: 'retryable_failure',
    });
  }
}

async function renderWorkflowStatus(
  runtime: OfficeRuntime,
  user: CurrentUser,
  binding: DocumentBinding,
  message: string,
  warning: boolean,
): Promise<void> {
  const state = await api.boundDocumentState(binding);
  await renderBoundDocument(runtime, user, binding, state, message);
  if (warning) getElement<HTMLElement>('.feedback').classList.add('warning');
}

async function openVersionCopy(
  runtime: OfficeRuntime,
  user: CurrentUser,
  binding: DocumentBinding,
  version: DocumentVersion,
): Promise<void> {
  const support = versionOpenSupport(runtime, version);
  if (!support.supported) return;

  const controller = new AbortController();
  const restoreActions = disablePaneActions();
  const feedback = getElement<HTMLElement>('.feedback');
  feedback.classList.remove('warning');
  feedback.textContent = `Authorizing ${versionLabel(version)}...`;
  showProgress('Authorizing version', 0, controller);

  try {
    const grant = await api.createDownloadGrant(
      binding,
      version.id,
      user.session.csrfToken,
    );
    assertVersionDownloadGrant(version, grant);
    controller.signal.throwIfAborted();
    const bytes = await downloadBlob(
      grant,
      version.artifact.byteSize,
      ({ loaded, total }) => {
        const percent = total > 0 ? loaded / total : 0;
        showProgress(
          `Downloading ${versionLabel(version)}`,
          5 + percent * 80,
          controller,
        );
      },
      controller.signal,
    );
    showProgress('Verifying exact package', 90, controller);
    await verifyExactOfficePackage(bytes, {
      contentLength: version.artifact.byteSize,
      fileName: version.artifact.originalFilename,
      mediaType: version.artifact.detectedMediaType,
      sha256: version.artifact.sha256,
      sourceHost: runtime.host,
    });
    controller.signal.throwIfAborted();
    showProgress(`Opening ${versionLabel(version)} copy`, 98, controller);
    const cancel = root.querySelector<HTMLButtonElement>('.cancel-button');
    if (cancel) cancel.disabled = true;
    await runtime.openExactPackage(bytes);
    hideProgress();
    restoreActions();
    feedback.textContent = `Opened ${versionLabel(version)} as a separate ${DOCUMENT_LABELS[runtime.host]}.`;
  } catch (error) {
    hideProgress();
    restoreActions();
    feedback.classList.add('warning');
    feedback.textContent = toErrorMessage(error);
  }
}

async function downloadVersion(
  runtime: OfficeRuntime,
  user: CurrentUser,
  binding: DocumentBinding,
  version: DocumentVersion,
): Promise<void> {
  const restoreActions = disablePaneActions();
  const feedback = getElement<HTMLElement>('.feedback');
  feedback.classList.remove('warning');
  feedback.textContent = `Authorizing ${versionLabel(version)} download...`;

  try {
    const grant = await api.createDownloadGrant(
      binding,
      version.id,
      user.session.csrfToken,
    );
    assertVersionDownloadGrant(version, grant);
    runtime.openBrowserWindow(resolveBrowserGrantUrl(grant.url));
    restoreActions();
    feedback.textContent = `Downloading the exact ${versionLabel(version)} package.`;
  } catch (error) {
    restoreActions();
    feedback.classList.add('warning');
    feedback.textContent = toErrorMessage(error);
  }
}

function disablePaneActions(): () => void {
  const controls = [
    ...root.querySelectorAll<
      HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement
    >('button, select, textarea'),
  ].filter(
    (control) =>
      !(
        control instanceof HTMLButtonElement &&
        control.classList.contains('cancel-button')
      ),
  );
  const states = controls.map(
    (control) => [control, control.disabled] as const,
  );
  controls.forEach((control) => {
    control.disabled = true;
  });
  return () => {
    states.forEach(([control, disabled]) => {
      control.disabled = disabled;
    });
  };
}

function assertVersionDownloadGrant(
  version: DocumentVersion,
  grant: DownloadGrant,
): void {
  if (
    grant.method !== 'GET' ||
    grant.filename !== version.artifact.originalFilename ||
    grant.sha256 !== version.artifact.sha256
  ) {
    throw new Error(
      'Authorized download metadata does not match this version.',
    );
  }
  const expiresAt = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('The authorized version download has expired.');
  }
}

function versionOpenSupport(
  runtime: OfficeRuntime,
  version: DocumentVersion,
): { reason: string; supported: false } | { supported: true } {
  if (version.artifact.scanStatus !== 'clean') {
    return {
      reason:
        'This version must pass package scanning before it can be opened.',
      supported: false,
    };
  }
  return runtime.exactOpenSupport(
    version.artifact.originalFilename,
    version.artifact.byteSize,
  );
}

async function capturePackage(
  runtime: OfficeRuntime,
  onPercent: (percent: number) => void,
  signal?: AbortSignal,
): Promise<CapturedOfficePackage> {
  if (runtime.fileName === null)
    throw new Error('Save this Office file first.');
  const capture = await captureExactOfficePackage(runtime.provider, {
    fileName: runtime.fileName,
    host: runtime.host,
    onProgress: ({ bytesCaptured, totalBytes }) => {
      onPercent(Math.min(100, (bytesCaptured / totalBytes) * 100));
    },
    ...(signal ? { signal } : {}),
    sliceSize: getOfficeSliceSize(runtime.platform),
  });
  window.dispatchEvent(
    new CustomEvent('mergecom:office-package-captured', { detail: capture }),
  );
  return capture;
}

async function pollProcessing(
  binding: DocumentBinding,
  versionId: string,
): Promise<DocumentVersion> {
  let latest: DocumentVersion | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const version = await api.version(binding, versionId);
    latest = version;
    showPushResult(
      version,
      version.status === 'conflicted' ? 'conflict' : 'created',
    );
    if (!ACTIVE_PROCESSING_STATES.has(version.processing.state)) return version;
    await delay(2_000);
  }
  if (!latest) throw new Error('Version processing status is unavailable.');
  return latest;
}

async function pollComparison(
  binding: DocumentBinding,
  comparisonId: string,
): Promise<VersionComparison> {
  let latest: VersionComparison | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    latest = await api.comparison(binding, comparisonId);
    const percent = Math.min(99, 98 + attempt / 30);
    showProgress('Processing comparison', percent);
    if (!ACTIVE_PROCESSING_STATES.has(latest.state)) return latest;
    await delay(2_000);
  }
  if (!latest) throw new Error('Comparison processing status is unavailable.');
  return latest;
}

function showPushStage(stage: PushStage, controller: AbortController): void {
  if (stage === 'creating-intent') {
    showProgress('Authorizing upload', 42, controller);
  } else if (stage === 'uploading') {
    showProgress('Uploading exact package', 45, controller);
  } else {
    showProgress('Finalizing version', 95, controller);
    const cancel = root.querySelector<HTMLButtonElement>('.cancel-button');
    if (cancel) cancel.disabled = true;
  }
}

function showProgress(
  label: string,
  percent: number,
  controller?: AbortController,
): void {
  const region = root.querySelector<HTMLElement>('.progress-region');
  const progress = root.querySelector<HTMLProgressElement>('progress');
  const progressLabel = root.querySelector<HTMLElement>('.progress-label');
  const stageLabel = root.querySelector<HTMLElement>('.progress-stage');
  if (!region || !progress || !progressLabel || !stageLabel) return;
  const rounded = Math.max(0, Math.min(100, Math.round(percent)));
  region.hidden = false;
  progress.value = rounded;
  progress.textContent = `${rounded}%`;
  progressLabel.textContent = `${rounded}%`;
  stageLabel.textContent = label;
  const cancel = region.querySelector<HTMLButtonElement>('.cancel-button');
  if (cancel && controller) {
    cancel.disabled = false;
    cancel.onclick = () => controller.abort();
  }
}

function hideProgress(): void {
  const region = root.querySelector<HTMLElement>('.progress-region');
  if (region) region.hidden = true;
}

function showPushResult(
  version: DocumentVersion,
  outcome: 'conflict' | 'created',
): void {
  const result = root.querySelector<HTMLElement>('.push-result');
  if (!result) return;
  result.hidden = false;
  result.classList.remove('completion');
  result.classList.toggle('conflict', outcome === 'conflict');
  result.innerHTML = `
    <i data-lucide="${outcome === 'conflict' ? 'triangle-alert' : 'circle-check'}" aria-hidden="true"></i>
    <div>
      <span>${outcome === 'conflict' ? 'CONFLICT PRESERVED' : 'VERSION FINALIZED'}</span>
      <strong>${escapeHtml(versionLabel(version))}</strong>
      <small>${escapeHtml(processingLabel(version))}</small>
    </div>
  `;
  drawIcons();
}

function showComparisonCompletion(
  runtime: OfficeRuntime,
  binding: DocumentBinding,
  version: DocumentVersion,
  comparison: VersionComparison | null,
  baselineReason: string,
): void {
  hideProgress();
  const result = root.querySelector<HTMLElement>('.push-result');
  if (!result) return;
  const warning =
    comparison?.completeness === 'partial' ||
    Boolean(comparison?.warnings.length);
  result.hidden = false;
  result.classList.remove('conflict');
  result.classList.add('completion');
  result.innerHTML = `
    <div class="completion-heading">
      <i data-lucide="circle-check" aria-hidden="true"></i>
      <div>
        <span>SAVE &amp; COMPARE COMPLETE</span>
        <strong>${escapeHtml(versionLabel(version))}</strong>
      </div>
    </div>
    <dl class="completion-details">
      <div><dt>Processing</dt><dd>${escapeHtml(processingLabel(version))}</dd></div>
      <div><dt>Baseline</dt><dd>${
        comparison
          ? `${escapeHtml(`V${comparison.baseVersion.displayNumber}`)} by ${escapeHtml(comparison.baseVersion.authorName)} · ${escapeHtml(formatDate(comparison.baseVersion.createdAt))}`
          : 'Not available'
      }</dd></div>
      <div><dt>Reason</dt><dd>${escapeHtml(baselineReason)}</dd></div>
      <div><dt>Changes</dt><dd>${comparison ? comparison.changes.length : 0}</dd></div>
    </dl>
    ${
      warning
        ? `<p class="completion-warning">${escapeHtml(comparison?.warnings[0] ?? 'Comparison coverage is partial.')}</p>`
        : ''
    }
    ${
      comparison
        ? '<button class="primary review-changes-button" type="button"><i data-lucide="external-link" aria-hidden="true"></i>Review Changes</button>'
        : '<p class="completion-warning">Save another version before starting a comparison.</p>'
    }
  `;
  result
    .querySelector<HTMLButtonElement>('.review-changes-button')
    ?.addEventListener('click', () => {
      if (!comparison) return;
      runtime.openBrowserWindow(
        webAppUrl(comparisonReviewPath(binding, comparison.id)),
      );
    });
  drawIcons();
}

function baselineReasonLabel(
  reason: 'approved_version' | 'verified_local_base' | 'previous_head' | 'none',
): string {
  const labels = {
    approved_version: 'Current approved version',
    none: 'No eligible baseline',
    previous_head: 'Previous branch head',
    verified_local_base: 'Verified local file base',
  };
  return labels[reason];
}

function renderRetryableFailure(runtime: OfficeRuntime, message: string): void {
  root.innerHTML = `
    ${brandMarkup()}
    <main class="content">
      ${contextMarkup(runtime.host, 'Office host', true)}
      <h1>MergeCom unavailable</h1>
      <p class="feedback warning" role="alert">${escapeHtml(message)}</p>
      <button class="primary retry-button" type="button">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>Retry
      </button>
    </main>
  `;
  getElement<HTMLButtonElement>('.retry-button').addEventListener(
    'click',
    () => {
      void start();
    },
  );
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
        <p class="feedback warning" role="alert">${escapeHtml(message)}</p>
      </div>
    </main>
  `;
  drawIcons();
}

function brandMarkup(): string {
  return `
    <header class="brand">
      <span class="brand-mark" aria-hidden="true">M</span>
      <strong>MergeCom</strong>
      <a class="brand-feedback" href="${webAppUrl('/app/setup?feedback=open&source=office-addin')}" target="_blank" rel="noreferrer">
        <i data-lucide="external-link" aria-hidden="true"></i>Feedback
      </a>
    </header>
  `;
}

function contextMarkup(host: OfficeHost, mode: string, live = false): string {
  return `
    <div class="context-line">
      <span>${HOST_LABELS[host].toUpperCase()}</span>
      <span class="mode-badge ${live ? 'live' : ''}">${escapeHtml(mode)}</span>
    </div>
  `;
}

function identityMarkup(user: CurrentUser): string {
  return `
    <section class="identity-line" aria-label="MergeCom identity">
      <div><span>${escapeHtml(user.user.displayName)}</span><strong>${escapeHtml(user.activeOrganization?.name ?? 'No workspace')}</strong></div>
    </section>
  `;
}

function progressMarkup(cancellable = false): string {
  return `
    <section class="progress-region" aria-live="polite" hidden>
      <div class="progress-copy"><span class="progress-stage">Working</span><strong class="progress-label">0%</strong></div>
      <progress value="0" max="100">0%</progress>
      ${cancellable ? '<button class="cancel-button" type="button" title="Cancel operation" aria-label="Cancel operation"><i data-lucide="x" aria-hidden="true"></i></button>' : ''}
    </section>
  `;
}

function baseStatus(
  baseVersion: DocumentVersion | undefined,
  headVersion: DocumentVersion | undefined,
): { label: string; message: string; warning: boolean } {
  if (!headVersion) {
    return { label: 'First version', message: '', warning: false };
  }
  if (!baseVersion) {
    return {
      label: 'Base unverified',
      message: 'An unbased push will be preserved as a conflict.',
      warning: true,
    };
  }
  if (baseVersion.id !== headVersion.id) {
    return {
      label: 'Behind latest',
      message: `${versionLabel(headVersion)} is newer than this file's ${versionLabel(baseVersion)} base.`,
      warning: true,
    };
  }
  return { label: 'Based on latest', message: '', warning: false };
}

function processingLabel(version: DocumentVersion): string {
  const labels: Record<DocumentVersion['processing']['state'], string> = {
    completed: 'Processing complete',
    permanently_failed: 'Processing failed',
    quarantined: 'Quarantined',
    queued: 'Queued for processing',
    retryable_failed: 'Retry scheduled',
    running: 'Processing',
  };
  return labels[version.processing.state];
}

function versionLabel(version: DocumentVersion): string {
  return `V${version.displayNumber}`;
}

function versionOptionLabel(version: DocumentVersion): string {
  const note = version.note.trim().replace(/\s+/gu, ' ');
  return note ? `${versionLabel(version)} - ${note}` : versionLabel(version);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function defaultDocumentName(fileName: string | null): string {
  if (!fileName) return 'Untitled';
  return fileName.replace(/\.(docx|xlsx|pptx)$/iu, '') || fileName;
}

function documentHistoryUrl(binding: DocumentBinding): string {
  return webAppUrl(
    `/app/projects/${binding.projectId}/documents/${binding.documentId}/history`,
  );
}

function drawIcons(): void {
  createIcons({
    icons: {
      CircleCheck,
      Download,
      ExternalLink,
      FolderOpen,
      History,
      Link2,
      LogIn,
      Plus,
      RefreshCw,
      TriangleAlert,
      Unlink,
      Upload,
      X,
    },
    root,
  });
}

function getElement<T extends Element>(selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null)
    throw new Error(`Missing task pane element: ${selector}`);
  return element;
}

function browserStorage(): KeyValueStorage {
  try {
    const key = 'mergecom.storage-check';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch {
    const values = new Map<string, string>();
    return {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    };
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return error.message || 'Operation cancelled.';
  }
  return error instanceof Error ? error.message : 'MergeCom request failed.';
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        '"': '&quot;',
        '&': '&amp;',
        "'": '&#039;',
        '<': '&lt;',
        '>': '&gt;',
      })[character] ?? character,
  );
}
