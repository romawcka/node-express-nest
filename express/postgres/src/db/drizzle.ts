import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../configs/app.config.ts';

const TIMEOUT_MLS = 5000;

const pool = new Pool({
  connectionString: config.db,
  connectionTimeoutMillis: TIMEOUT_MLS,
});

pool.on('error', (error) => console.error('Unexpected error on idle database client', error));

export const db = drizzle({ client: pool, logger: true });

export const connectToDatabase = async () => {
  try {
    await db.execute(sql`select 1`);
    console.log('Connected to Database');
  } catch (err) {
    const reason = err instanceof Error && err.cause ? err.cause : err;
    console.error('Failed to connect to database:', reason);
    process.exit(1);
  }
};

export const isDatabaseConnected = async () => {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
};

export const closeDatabase = () => pool.end();
