import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDatabase } from './database';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error('DATABASE_URL is required to run migrations.');

const database = createDatabase(databaseUrl);
try {
  await migrate(database.db, { migrationsFolder: 'drizzle' });
  console.info('Database migrations completed.');
} finally {
  await database.close();
}
