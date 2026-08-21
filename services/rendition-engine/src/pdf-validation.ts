const FORBIDDEN_PDF_TOKENS: ReadonlyArray<{
  code: string;
  pattern: RegExp;
}> = [
  { code: 'pdf_javascript', pattern: /\/JavaScript\b|\/JS\b/u },
  { code: 'pdf_embedded_file', pattern: /\/EmbeddedFile\b/u },
  { code: 'pdf_file_specification', pattern: /\/Filespec\b/u },
  { code: 'pdf_launch_action', pattern: /\/Launch\b/u },
  { code: 'pdf_open_action', pattern: /\/OpenAction\b/u },
  { code: 'pdf_additional_action', pattern: /\/AA\b/u },
];

export class PdfValidationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
  }
}

export interface PdfFacts {
  dimensions: Array<{ height: number; width: number }>;
  pageCount: number;
}

export function validatePdf(bytes: Uint8Array): PdfFacts {
  if (bytes.byteLength < 8) throw new PdfValidationError('pdf_invalid');
  const text = new TextDecoder('latin1').decode(bytes);
  if (!text.startsWith('%PDF-') || !/%%EOF\s*$/u.test(text)) {
    throw new PdfValidationError('pdf_invalid');
  }
  for (const forbidden of FORBIDDEN_PDF_TOKENS) {
    if (forbidden.pattern.test(text)) {
      throw new PdfValidationError(forbidden.code);
    }
  }
  const pageMatches = [...text.matchAll(/\/Type\s*\/Page(?!s)\b/gu)];
  if (pageMatches.length === 0) throw new PdfValidationError('pdf_no_pages');
  const dimensions = [
    ...text.matchAll(
      /\/MediaBox\s*\[\s*[-.\d]+\s+[-.\d]+\s+([-.\d]+)\s+([-.\d]+)\s*\]/gu,
    ),
  ]
    .slice(0, pageMatches.length)
    .map((match) => ({
      height: Number(match[2]),
      width: Number(match[1]),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.height) &&
        Number.isFinite(item.width) &&
        item.height > 0 &&
        item.width > 0,
    );
  return {
    dimensions:
      dimensions.length === pageMatches.length
        ? dimensions
        : Array.from({ length: pageMatches.length }, () => ({
            height: 792,
            width: 612,
          })),
    pageCount: pageMatches.length,
  };
}
