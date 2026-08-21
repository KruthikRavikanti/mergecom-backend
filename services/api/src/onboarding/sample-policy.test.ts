import { describe, expect, it } from 'vitest';

import { isSyntheticSampleName, SAMPLE_NAME_PREFIX } from './sample-policy';

describe('synthetic sample naming policy', () => {
  it('requires an explicit prefix and a descriptive name', () => {
    expect(isSyntheticSampleName(`${SAMPLE_NAME_PREFIX}Word Review.docx`)).toBe(
      true,
    );
    expect(isSyntheticSampleName(SAMPLE_NAME_PREFIX)).toBe(false);
    expect(isSyntheticSampleName('Customer Review.docx')).toBe(false);
  });
});
