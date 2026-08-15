import { Pool } from 'pg';

export type DependencyState = 'ready' | 'unavailable';
export interface ReadinessProbe {
  (): Promise<Record<string, DependencyState>>;
  close?: () => Promise<void>;
}

export function createPostgresReadinessProbe(
  databaseUrl: string | undefined,
): ReadinessProbe {
  if (!databaseUrl) return () => Promise.resolve({ database: 'unavailable' });

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const probe: ReadinessProbe = async () => {
    try {
      await pool.query('select 1');
      return { database: 'ready' };
    } catch {
      return { database: 'unavailable' };
    }
  };
  probe.close = () => pool.end();
  return probe;
}
