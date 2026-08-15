import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseContext {
  db: Database;
  pool: Pool;
  close: () => Promise<void>;
}

export function createDatabase(databaseUrl: string): DatabaseContext {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  return {
    close: () => pool.end(),
    db: drizzle(pool, { schema }),
    pool,
  };
}
