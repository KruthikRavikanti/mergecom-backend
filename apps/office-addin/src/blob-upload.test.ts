import { describe, expect, it } from 'vitest';

import { rewriteLocalGrantUrl } from './blob-upload';

describe('local signed grant proxy', () => {
  it('preserves the signed path and query through the HTTPS proxy', () => {
    expect(
      rewriteLocalGrantUrl(
        'http://localhost:9000/mergecom/staged/file?X-Amz-Signature=abc',
        'http://localhost:9000',
        'https://localhost:5176/blob',
      ),
    ).toBe(
      'https://localhost:5176/blob/mergecom/staged/file?X-Amz-Signature=abc',
    );
  });

  it('does not rewrite grants from another storage origin', () => {
    const grant = 'https://storage.example/files/one?signature=abc';
    expect(
      rewriteLocalGrantUrl(
        grant,
        'http://localhost:9000',
        'https://localhost:5176/blob',
      ),
    ).toBe(grant);
  });
});
