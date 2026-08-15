import { describe, expect, it } from 'vitest';

import { assertOfficeArtifact } from './index';

describe('assertOfficeArtifact', () => {
  it('rejects empty artifacts', () => {
    expect(() =>
      assertOfficeArtifact({
        contentLength: 0,
        mediaType: 'application/octet-stream',
        sha256: 'a'.repeat(64),
        sourceHost: 'word',
      }),
    ).toThrow('cannot be empty');
  });
});
