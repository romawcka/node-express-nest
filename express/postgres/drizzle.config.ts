import { defineConfig } from 'drizzle-kit';

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  throw new Error('DATABASE_URL is not set (see express/postgres/.env)');
}

export default defineConfig({
  out: './drizzle',
  schema: './src/models/task.model.ts',
  dialect: 'postgresql',
  dbCredentials: { url: DB_URL },
});
