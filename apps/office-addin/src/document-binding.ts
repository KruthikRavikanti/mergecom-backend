import type { OfficeHost } from '@mergecom/office-core';

export type DocumentKind = 'presentation' | 'spreadsheet' | 'word_document';

export interface DocumentBinding {
  documentId: string;
  documentKind: DocumentKind;
  organizationId: string;
  projectId: string;
  schemaVersion: 1;
}

export interface DocumentBindingStore {
  clear(): Promise<void>;
  load(): DocumentBinding | null;
  save(binding: DocumentBinding): Promise<void>;
}

export const DOCUMENT_BINDING_SETTING = 'mergecom.document-binding.v1';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function documentKindForHost(host: OfficeHost): DocumentKind {
  if (host === 'excel') return 'spreadsheet';
  if (host === 'powerpoint') return 'presentation';
  return 'word_document';
}

export function parseDocumentBinding(value: unknown): DocumentBinding | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (
    !isUuid(value.organizationId) ||
    !isUuid(value.projectId) ||
    !isUuid(value.documentId) ||
    !isDocumentKind(value.documentKind)
  ) {
    return null;
  }
  return {
    documentId: value.documentId,
    documentKind: value.documentKind,
    organizationId: value.organizationId,
    projectId: value.projectId,
    schemaVersion: 1,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isDocumentKind(value: unknown): value is DocumentKind {
  return (
    value === 'presentation' ||
    value === 'spreadsheet' ||
    value === 'word_document'
  );
}
