import { describe, expect, it } from 'vitest';

import { documentKindForHost, parseDocumentBinding } from './document-binding';

const binding = {
  documentId: '60000000-0000-4000-8000-000000000002',
  documentKind: 'spreadsheet',
  organizationId: '10000000-0000-4000-8000-000000000001',
  projectId: '40000000-0000-4000-8000-000000000001',
  schemaVersion: 1,
};

describe('document binding', () => {
  it('maps every supported host to its API document kind', () => {
    expect(documentKindForHost('excel')).toBe('spreadsheet');
    expect(documentKindForHost('powerpoint')).toBe('presentation');
    expect(documentKindForHost('word')).toBe('word_document');
  });

  it('accepts only the versioned non-secret identifier shape', () => {
    expect(parseDocumentBinding(binding)).toEqual(binding);
    expect(parseDocumentBinding({ ...binding, schemaVersion: 2 })).toBeNull();
    expect(parseDocumentBinding({ ...binding, documentId: 'not-an-id' })).toBe(
      null,
    );
    expect(parseDocumentBinding({ ...binding, accessToken: 'secret' })).toEqual(
      binding,
    );
  });
});
