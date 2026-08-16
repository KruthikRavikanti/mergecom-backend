import { describe, expect, it } from 'vitest';

import { createBaseContextStore, parseBaseContext } from './base-context';
import type { DocumentBinding } from './document-binding';

const binding: DocumentBinding = {
  documentId: '60000000-0000-4000-8000-000000000002',
  documentKind: 'spreadsheet',
  organizationId: '10000000-0000-4000-8000-000000000001',
  projectId: '40000000-0000-4000-8000-000000000001',
  schemaVersion: 1,
};

describe('base context', () => {
  it('persists context separately for copies at different document URLs', async () => {
    const values = new Map<string, string>();
    const store = createBaseContextStore({
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    });
    const first = {
      baseVersionId: '70000000-0000-4000-8000-000000000001',
      schemaVersion: 1 as const,
    };

    await store.save(binding, 'https://files.example/first.xlsx', first);
    expect(
      await store.load(binding, 'https://files.example/first.xlsx'),
    ).toEqual(first);
    expect(
      await store.load(binding, 'https://files.example/copy.xlsx'),
    ).toBeNull();
    expect([...values.keys()][0]).not.toContain('files.example');
  });

  it('fails closed for malformed or unsupported stored context', () => {
    expect(parseBaseContext({ baseVersionId: null, schemaVersion: 1 })).toEqual(
      {
        baseVersionId: null,
        schemaVersion: 1,
      },
    );
    expect(parseBaseContext({ baseVersionId: 'bad', schemaVersion: 1 })).toBe(
      null,
    );
    expect(parseBaseContext({ baseVersionId: null, schemaVersion: 2 })).toBe(
      null,
    );
  });
});
