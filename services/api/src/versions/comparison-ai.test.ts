import { describe, expect, it } from 'vitest';

import { validateComparisonAiExplanation } from './comparison-ai';

describe('comparison AI explanation validation', () => {
  it('accepts cited paragraphs and records deterministic hashes', () => {
    const explanation = validateComparisonAiExplanation({
      allowedChangeIds: ['change-1', 'change-2'],
      inputHash: 'a'.repeat(64),
      paragraphs: [
        {
          changeIds: ['change-2', 'change-1'],
          text: ' Verify these changes. ',
        },
      ],
    });
    expect(explanation).toMatchObject({
      inputHash: 'a'.repeat(64),
      originatingChangeIds: ['change-1', 'change-2'],
      paragraphs: [
        { changeIds: ['change-2', 'change-1'], text: 'Verify these changes.' },
      ],
    });
    expect(explanation?.outputHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects malformed or cross-comparison output', () => {
    const invalidOutputs: unknown[] = [
      [],
      [{ changeIds: [], text: 'Missing citations.' }],
      [{ changeIds: ['other-comparison-change'], text: 'Invalid citation.' }],
      [{ changeIds: ['change-1'], text: '' }],
    ];
    for (const paragraphs of invalidOutputs) {
      expect(
        validateComparisonAiExplanation({
          allowedChangeIds: ['change-1'],
          inputHash: 'a'.repeat(64),
          paragraphs,
        }),
      ).toBeNull();
    }
  });
});
