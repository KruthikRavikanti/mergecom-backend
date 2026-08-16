import { createApiClient, type components } from '@mergecom/contracts';

import type { DocumentBinding, DocumentKind } from './document-binding';
import type { OfficeVersionGateway, UploadIntentInput } from './push-version';

export type CurrentUser = components['schemas']['CurrentUser'];
export type Document = components['schemas']['Document'];
export type DocumentVersion = components['schemas']['DocumentVersion'];
export type FinalizeVersionResult =
  components['schemas']['FinalizeVersionResult'];
export type Project = components['schemas']['Project'];
export type SignedBlobGrant = components['schemas']['SignedBlobGrant'];
export type UploadIntent = components['schemas']['UploadIntent'];

export interface DocumentChoice extends Document {
  folderPath: string;
}

export interface BoundDocumentState {
  branch: components['schemas']['VersionPage']['branch'];
  document: Document;
  project: Project;
  versions: DocumentVersion[];
}

const MAX_LIST_ITEMS = 10_000;

export class OfficeApi implements OfficeVersionGateway {
  private readonly client;

  public constructor(baseUrl = defaultApiBaseUrl()) {
    this.client = createApiClient(baseUrl);
  }

  public async currentUser(): Promise<CurrentUser | null> {
    const result = await this.client.GET('/v1/me');
    if (result.response.status === 401) return null;
    if (!result.response.ok || !result.data) {
      throw failure(result.error, 'MergeCom identity could not be loaded.');
    }
    return result.data;
  }

  public async createOfficeHandoff(csrfToken: string): Promise<string> {
    const result = await this.client.POST('/auth/office/handoff', {
      params: { header: { 'X-CSRF-Token': csrfToken } },
    });
    if (!result.response.ok || !result.data) {
      throw failure(result.error, 'Office sign-in could not be completed.');
    }
    return result.data.code;
  }

  public async exchangeOfficeSession(code: string): Promise<void> {
    const result = await this.client.POST('/auth/office/exchange', {
      body: { code },
    });
    if (!result.response.ok || !result.data?.authenticated) {
      throw failure(result.error, 'Office sign-in could not be completed.');
    }
  }

  public async listProjects(organizationId: string): Promise<Project[]> {
    const items: Project[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.client.GET(
        '/v1/organizations/{organizationId}/projects',
        {
          params: {
            path: { organizationId },
            query: {
              archived: false,
              limit: 100,
              ...(cursor ? { cursor } : {}),
            },
          },
        },
      );
      if (!result.response.ok || !result.data) {
        throw failure(result.error, 'Projects could not be loaded.');
      }
      items.push(...result.data.items);
      assertListBound(items.length);
      cursor = result.data.nextCursor ?? undefined;
    } while (cursor);
    return items;
  }

  public async listDocuments(
    organizationId: string,
    projectId: string,
    documentKind: DocumentKind,
  ): Promise<DocumentChoice[]> {
    const choices: DocumentChoice[] = [];
    const folders: Array<{ id: string | null; path: string }> = [
      { id: null, path: '' },
    ];
    const visited = new Set<string>();

    while (folders.length > 0) {
      const folder = folders.shift();
      if (!folder) break;
      if (folder.id && visited.has(folder.id)) {
        throw new Error('MergeCom returned a cyclic folder tree.');
      }
      if (folder.id) visited.add(folder.id);

      choices.push(
        ...(
          await this.listDocumentsInFolder(organizationId, projectId, folder.id)
        )
          .filter((document) => document.kind === documentKind)
          .map((document) => ({ ...document, folderPath: folder.path })),
      );
      const children = await this.listChildFolders(
        organizationId,
        projectId,
        folder.id,
      );
      for (const child of children) {
        folders.push({
          id: child.id,
          path: folder.path ? `${folder.path} / ${child.name}` : child.name,
        });
      }
      assertListBound(choices.length + folders.length + visited.size);
    }
    return choices;
  }

  public async boundDocumentState(
    binding: DocumentBinding,
  ): Promise<BoundDocumentState> {
    const [documentResult, projectResult] = await Promise.all([
      this.client.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}',
        { params: { path: binding } },
      ),
      this.client.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}',
        { params: { path: binding } },
      ),
    ]);
    if (!documentResult.response.ok || !documentResult.data) {
      throw failure(
        documentResult.error,
        'The linked MergeCom document is unavailable.',
      );
    }
    if (documentResult.data.kind !== binding.documentKind) {
      throw new Error('The linked document type no longer matches this host.');
    }
    if (!projectResult.response.ok || !projectResult.data) {
      throw failure(projectResult.error, 'The linked project is unavailable.');
    }

    const versions: DocumentVersion[] = [];
    let branch: BoundDocumentState['branch'] | null = null;
    let cursor: string | undefined;
    do {
      const result = await this.client.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/versions',
        {
          params: {
            path: binding,
            query: { limit: 100, ...(cursor ? { cursor } : {}) },
          },
        },
      );
      if (!result.response.ok || !result.data) {
        throw failure(result.error, 'Version status could not be loaded.');
      }
      branch = result.data.branch;
      versions.push(...result.data.items);
      assertListBound(versions.length);
      cursor = result.data.nextCursor ?? undefined;
    } while (cursor);
    if (!branch) throw new Error('MergeCom did not return a document branch.');
    return {
      branch,
      document: documentResult.data,
      project: projectResult.data,
      versions,
    };
  }

  public async version(
    binding: DocumentBinding,
    versionId: string,
  ): Promise<DocumentVersion> {
    const result = await this.client.GET(
      '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/versions/{versionId}',
      { params: { path: { ...binding, versionId } } },
    );
    if (!result.response.ok || !result.data) {
      throw failure(
        result.error,
        'Version processing status could not be loaded.',
      );
    }
    return result.data;
  }

  public async createUploadIntent(
    input: UploadIntentInput,
  ): Promise<UploadIntent> {
    const result = await this.client.POST(
      '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/uploads',
      {
        body: {
          baseVersionId: input.baseVersionId,
          byteSize: input.byteSize,
          clientMediaType: input.mediaType,
          filename: input.fileName,
          sha256: input.sha256,
        },
        params: {
          header: {
            'Idempotency-Key': input.idempotencyKey,
            'X-CSRF-Token': input.csrfToken,
          },
          path: input.binding,
        },
      },
    );
    if (!result.response.ok || !result.data) {
      throw failure(result.error, 'Upload intent could not be created.');
    }
    return result.data;
  }

  public async signMultipartPart(input: {
    binding: DocumentBinding;
    csrfToken: string;
    partNumber: number;
    uploadId: string;
  }): Promise<SignedBlobGrant> {
    const result = await this.client.POST(
      '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/uploads/{uploadId}/parts/{partNumber}/grant',
      {
        params: {
          header: { 'X-CSRF-Token': input.csrfToken },
          path: {
            ...input.binding,
            partNumber: input.partNumber,
            uploadId: input.uploadId,
          },
        },
      },
    );
    if (!result.response.ok || !result.data) {
      throw failure(
        result.error,
        'Multipart upload grant could not be created.',
      );
    }
    return result.data;
  }

  public async completeMultipart(input: {
    binding: DocumentBinding;
    csrfToken: string;
    parts: Array<{ etag: string; partNumber: number }>;
    uploadId: string;
  }): Promise<void> {
    const result = await this.client.POST(
      '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/uploads/{uploadId}/multipart/complete',
      {
        body: { parts: input.parts },
        params: {
          header: { 'X-CSRF-Token': input.csrfToken },
          path: { ...input.binding, uploadId: input.uploadId },
        },
      },
    );
    if (!result.response.ok) {
      throw failure(result.error, 'Multipart upload could not be completed.');
    }
  }

  public async finalizeUpload(input: {
    binding: DocumentBinding;
    csrfToken: string;
    idempotencyKey: string;
    note: string;
    source: 'office_addin';
    uploadId: string;
  }): Promise<FinalizeVersionResult> {
    const result = await this.client.POST(
      '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/uploads/{uploadId}/finalize',
      {
        body: { note: input.note, source: input.source },
        params: {
          header: {
            'Idempotency-Key': input.idempotencyKey,
            'X-CSRF-Token': input.csrfToken,
          },
          path: { ...input.binding, uploadId: input.uploadId },
        },
      },
    );
    if (
      result.response.status === 409 &&
      result.error &&
      'outcome' in result.error
    ) {
      return result.error as FinalizeVersionResult;
    }
    if (!result.response.ok || !result.data) {
      throw failure(result.error, 'Version could not be finalized.');
    }
    return result.data;
  }

  public async cancelUpload(input: {
    binding: DocumentBinding;
    csrfToken: string;
    uploadId: string;
  }): Promise<void> {
    const result = await this.client.DELETE(
      '/v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/uploads/{uploadId}',
      {
        params: {
          header: { 'X-CSRF-Token': input.csrfToken },
          path: { ...input.binding, uploadId: input.uploadId },
        },
      },
    );
    if (!result.response.ok) {
      throw failure(result.error, 'Staged upload could not be cancelled.');
    }
  }

  private async listChildFolders(
    organizationId: string,
    projectId: string,
    parentFolderId: string | null,
  ) {
    const items: components['schemas']['Folder'][] = [];
    let cursor: string | undefined;
    do {
      const result = await this.client.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}/folders',
        {
          params: {
            path: { organizationId, projectId },
            query: {
              limit: 100,
              ...(cursor ? { cursor } : {}),
              ...(parentFolderId ? { parentFolderId } : {}),
            },
          },
        },
      );
      if (!result.response.ok || !result.data) {
        throw failure(result.error, 'Project folders could not be loaded.');
      }
      items.push(...result.data.items);
      assertListBound(items.length);
      cursor = result.data.nextCursor ?? undefined;
    } while (cursor);
    return items;
  }

  private async listDocumentsInFolder(
    organizationId: string,
    projectId: string,
    folderId: string | null,
  ): Promise<Document[]> {
    const items: Document[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.client.GET(
        '/v1/organizations/{organizationId}/projects/{projectId}/documents',
        {
          params: {
            path: { organizationId, projectId },
            query: {
              archived: false,
              limit: 100,
              ...(cursor ? { cursor } : {}),
              ...(folderId ? { folderId } : {}),
            },
          },
        },
      );
      if (!result.response.ok || !result.data) {
        throw failure(result.error, 'Project documents could not be loaded.');
      }
      items.push(...result.data.items);
      assertListBound(items.length);
      cursor = result.data.nextCursor ?? undefined;
    } while (cursor);
    return items;
  }
}

export function webAppUrl(path: string): string {
  const configured = import.meta.env.VITE_WEB_APP_BASE_URL;
  const base =
    configured ??
    (import.meta.env.DEV ? 'http://localhost:5173' : window.location.origin);
  return new URL(path, `${base.replace(/\/$/u, '')}/`).href;
}

export function apiUrl(path: string): string {
  return new URL(path.replace(/^\//u, ''), `${defaultApiBaseUrl()}/`).href;
}

function defaultApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  return new URL(configured ?? '/api', window.location.origin).href.replace(
    /\/$/u,
    '',
  );
}

function assertListBound(count: number): void {
  if (count > MAX_LIST_ITEMS) {
    throw new Error(
      'MergeCom returned too many items for the Office task pane.',
    );
  }
}

function failure(error: unknown, fallback: string): Error {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return new Error(error.message);
  }
  return new Error(fallback);
}
