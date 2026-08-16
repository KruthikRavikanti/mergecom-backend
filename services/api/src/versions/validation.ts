import path from 'node:path';

import type { DocumentKind } from '../projects/types';

const officeTypes: Record<
  string,
  { documentKind: DocumentKind; mediaType: string }
> = {
  '.docm': {
    documentKind: 'word_document',
    mediaType: 'application/vnd.ms-word.document.macroEnabled.12',
  },
  '.docx': {
    documentKind: 'word_document',
    mediaType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  '.pptm': {
    documentKind: 'presentation',
    mediaType: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  },
  '.pptx': {
    documentKind: 'presentation',
    mediaType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  '.xlsm': {
    documentKind: 'spreadsheet',
    mediaType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  },
  '.xlsx': {
    documentKind: 'spreadsheet',
    mediaType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

export type UploadValidationErrorCode =
  | 'document_type_mismatch'
  | 'invalid_extension'
  | 'invalid_filename'
  | 'invalid_hash'
  | 'invalid_office_package'
  | 'invalid_size'
  | 'upload_too_large';

export class UploadValidationError extends Error {
  public constructor(public readonly code: UploadValidationErrorCode) {
    super(code);
  }
}

export function validateUploadMetadata(input: {
  byteSize: number;
  documentKind: DocumentKind;
  filename: string;
  maxUploadBytes: number;
  sha256: string;
}): { extension: string; mediaType: string } {
  const hasControlCharacter = [...input.filename].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (
    !input.filename ||
    input.filename.length > 255 ||
    input.filename !== path.basename(input.filename) ||
    /[\\/]/u.test(input.filename) ||
    hasControlCharacter
  ) {
    throw new UploadValidationError('invalid_filename');
  }
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0) {
    throw new UploadValidationError('invalid_size');
  }
  if (input.byteSize > input.maxUploadBytes) {
    throw new UploadValidationError('upload_too_large');
  }
  if (!/^[0-9a-f]{64}$/u.test(input.sha256)) {
    throw new UploadValidationError('invalid_hash');
  }
  const extension = path.extname(input.filename).toLowerCase();
  const officeType = officeTypes[extension];
  if (!officeType) throw new UploadValidationError('invalid_extension');
  if (officeType.documentKind !== input.documentKind) {
    throw new UploadValidationError('document_type_mismatch');
  }
  return { extension, mediaType: officeType.mediaType };
}

export function detectOfficeMediaType(
  prefix: Uint8Array,
  extension: string,
): string {
  const hasZipMagic =
    prefix.length >= 4 &&
    prefix[0] === 0x50 &&
    prefix[1] === 0x4b &&
    ((prefix[2] === 0x03 && prefix[3] === 0x04) ||
      (prefix[2] === 0x05 && prefix[3] === 0x06) ||
      (prefix[2] === 0x07 && prefix[3] === 0x08));
  if (!hasZipMagic) {
    throw new UploadValidationError('invalid_office_package');
  }
  const officeType = officeTypes[extension];
  if (!officeType) throw new UploadValidationError('invalid_extension');
  return officeType.mediaType;
}
