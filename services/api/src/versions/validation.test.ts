import { describe, expect, it } from 'vitest';

import {
  detectOfficeMediaType,
  UploadValidationError,
  validateUploadMetadata,
} from './validation';

const sha256 = 'a'.repeat(64);

describe('Office artifact validation', () => {
  it('derives media type from a compatible extension and ZIP magic', () => {
    const metadata = validateUploadMetadata({
      byteSize: 1024,
      documentKind: 'presentation',
      filename: 'Board update.pptx',
      maxUploadBytes: 2048,
      sha256,
    });
    expect(metadata.extension).toBe('.pptx');
    expect(
      detectOfficeMediaType(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), '.pptx'),
    ).toBe(metadata.mediaType);
  });

  it('rejects an extension that does not match the document record', () => {
    expect(() =>
      validateUploadMetadata({
        byteSize: 1024,
        documentKind: 'spreadsheet',
        filename: 'Board update.pptx',
        maxUploadBytes: 2048,
        sha256,
      }),
    ).toThrowError(new UploadValidationError('document_type_mismatch'));
  });

  it('rejects client bytes without ZIP package magic', () => {
    expect(() =>
      detectOfficeMediaType(Uint8Array.from([0x25, 0x50, 0x44, 0x46]), '.docx'),
    ).toThrowError(new UploadValidationError('invalid_office_package'));
  });
});
