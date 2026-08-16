import { Pool } from 'pg';

import type { BlobStore } from './storage/blob-store';

export type DependencyState = 'ready' | 'unavailable';
export interface ReadinessProbe {
  (): Promise<Record<string, DependencyState>>;
  close?: () => Promise<void>;
}

export function createPostgresReadinessProbe(
  databaseUrl: string | undefined,
  blobStore?: BlobStore,
): ReadinessProbe {
  if (!databaseUrl) {
    return async () => ({
      database: 'unavailable',
      ...(blobStore
        ? { objectStorage: (await blobStore.probe()) ? 'ready' : 'unavailable' }
        : {}),
    });
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const probe: ReadinessProbe = async () => {
    let database: DependencyState = 'unavailable';
    try {
      await pool.query('select 1');
      database = 'ready';
    } catch {
      database = 'unavailable';
    }
    return {
      database,
      ...(blobStore
        ? { objectStorage: (await blobStore.probe()) ? 'ready' : 'unavailable' }
        : {}),
    };
  };
  probe.close = () => pool.end();
  return probe;
}
