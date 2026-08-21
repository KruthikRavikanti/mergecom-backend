import { createHash } from 'node:crypto';

export interface ComparisonAiParagraph {
  changeIds: string[];
  text: string;
}

export interface ValidatedComparisonAiExplanation {
  inputHash: string;
  originatingChangeIds: string[];
  outputHash: string;
  paragraphs: ComparisonAiParagraph[];
}

export function validateComparisonAiExplanation(input: {
  allowedChangeIds: string[];
  inputHash: string;
  paragraphs: unknown;
}): ValidatedComparisonAiExplanation | null {
  if (!Array.isArray(input.paragraphs) || input.paragraphs.length === 0) {
    return null;
  }
  const allowed = new Set(input.allowedChangeIds);
  const paragraphs: ComparisonAiParagraph[] = [];
  for (const candidate of input.paragraphs) {
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.text !== 'string' ||
      record.text.trim().length === 0 ||
      record.text.length > 2_000 ||
      !Array.isArray(record.changeIds) ||
      record.changeIds.length === 0 ||
      record.changeIds.some(
        (changeId) => typeof changeId !== 'string' || !allowed.has(changeId),
      )
    ) {
      return null;
    }
    paragraphs.push({
      changeIds: [...new Set(record.changeIds as string[])],
      text: record.text.trim(),
    });
  }
  const originatingChangeIds = [
    ...new Set(paragraphs.flatMap((paragraph) => paragraph.changeIds)),
  ].sort();
  return {
    inputHash: input.inputHash,
    originatingChangeIds,
    outputHash: createHash('sha256')
      .update(JSON.stringify(paragraphs))
      .digest('hex'),
    paragraphs,
  };
}
