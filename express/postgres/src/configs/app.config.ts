const DB_URL_DEFAULT = 'postgresql://postgres:postgres@localhost:5432/rest_express';

const port = parseInt(process.env.PORT ?? '3203');
const db = process.env.DATABASE_URL ?? DB_URL_DEFAULT;

export const config = { port, db };
