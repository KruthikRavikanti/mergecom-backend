import { describe, expect, it } from 'vitest';

import { PdfValidationError, validatePdf } from './pdf-validation';

function pdf(extra = '') {
  return new TextEncoder().encode(
    `%PDF-1.7\n1 0 obj <</Type /Page /MediaBox [0 0 612 792] ${extra}>> endobj\n%%EOF`,
  );
}

describe('validatePdf', () => {
  it('returns bounded page facts for a passive PDF', () => {
    expect(validatePdf(pdf())).toEqual({
      dimensions: [{ height: 792, width: 612 }],
      pageCount: 1,
    });
  });

  it.each(['/JavaScript', '/EmbeddedFile', '/Launch', '/OpenAction'])(
    'rejects active PDF token %s',
    (token) => {
      expect(() => validatePdf(pdf(token))).toThrow(PdfValidationError);
    },
  );

  it('rejects invalid or pageless output', () => {
    expect(() => validatePdf(new TextEncoder().encode('not a pdf'))).toThrow(
      'pdf_invalid',
    );
    expect(() =>
      validatePdf(new TextEncoder().encode('%PDF-1.7\n%%EOF')),
    ).toThrow('pdf_no_pages');
  });
});
