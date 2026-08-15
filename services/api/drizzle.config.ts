import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run Drizzle commands.');
}

export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
  out: './drizzle',
  schema: './src/db/schema.ts',
  strict: true,
  verbose: true,
});
