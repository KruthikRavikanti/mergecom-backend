import type { DocumentBinding } from './document-binding';

export interface BaseContext {
  baseVersionId: string | null;
  schemaVersion: 1;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface BaseContextStore {
  clear(binding: DocumentBinding, documentUrl: string): Promise<void>;
  load(
    binding: DocumentBinding,
    documentUrl: string,
  ): Promise<BaseContext | null>;
  save(
    binding: DocumentBinding,
    documentUrl: string,
    context: BaseContext,
  ): Promise<void>;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function createBaseContextStore(
  storage: KeyValueStorage,
): BaseContextStore {
  return {
    async clear(binding, documentUrl) {
      storage.removeItem(await storageKey(binding, documentUrl));
    },
    async load(binding, documentUrl) {
      const stored = storage.getItem(await storageKey(binding, documentUrl));
      if (stored === null) return null;
      try {
        const value: unknown = JSON.parse(stored);
        return parseBaseContext(value);
      } catch {
        return null;
      }
    },
    async save(binding, documentUrl, context) {
      storage.setItem(
        await storageKey(binding, documentUrl),
        JSON.stringify(context),
      );
    },
  };
}

export function parseBaseContext(value: unknown): BaseContext | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('baseVersionId' in value)
  ) {
    return null;
  }
  const baseVersionId = value.baseVersionId;
  if (baseVersionId !== null && !isUuid(baseVersionId)) return null;
  return { baseVersionId, schemaVersion: 1 };
}

async function storageKey(
  binding: DocumentBinding,
  documentUrl: string,
): Promise<string> {
  const identity = [
    binding.organizationId,
    binding.projectId,
    binding.documentId,
    documentUrl,
  ].join('\n');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identity),
  );
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `mergecom.base-context.v1.${hash}`;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
