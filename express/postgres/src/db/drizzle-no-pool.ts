// here is example how to create db example with no separate pool example
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../configs/app.config.ts';

const TIMEOUT_MLS = 5000;

export const db = drizzle({
  connection: {
    connectionString: config.db,
    connectionTimeoutMillis: TIMEOUT_MLS,
  },
  logger: true,
});

db.$client.on('error', (error) => console.error('Unexpected error on idle database client', error));

export const isDatabaseConnected = async () => {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
};

export const closeDatabase = () => db.$client.end();
