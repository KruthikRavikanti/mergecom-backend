export interface NameCursor {
  id: string;
  name: string;
}

export interface OrderedCursor extends NameCursor {
  sortOrder: number;
}

export interface UpdatedCursor {
  id: string;
  updatedAt: string;
}

export function encodeCursor(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeObject(cursor: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Cursor is not an object.');
    }
    return value as Record<string, unknown>;
  } catch {
    throw new Error('invalid_cursor');
  }
}

export function decodeUpdatedCursor(cursor: string): UpdatedCursor {
  const value = decodeObject(cursor);
  if (typeof value.id !== 'string' || typeof value.updatedAt !== 'string') {
    throw new Error('invalid_cursor');
  }
  const updatedAt = new Date(value.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) throw new Error('invalid_cursor');
  return { id: value.id, updatedAt: updatedAt.toISOString() };
}

export function decodeOrderedCursor(cursor: string): OrderedCursor {
  const value = decodeObject(cursor);
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.sortOrder !== 'number' ||
    !Number.isSafeInteger(value.sortOrder)
  ) {
    throw new Error('invalid_cursor');
  }
  return { id: value.id, name: value.name, sortOrder: value.sortOrder };
}

export function decodeNameCursor(cursor: string): NameCursor {
  const value = decodeObject(cursor);
  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error('invalid_cursor');
  }
  return { id: value.id, name: value.name };
}
