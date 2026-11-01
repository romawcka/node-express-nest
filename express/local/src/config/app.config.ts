import path from "node:path";

const port = parseInt(process.env.PORT ?? "3201");
const db = path.resolve(process.env.DB ?? "db.json");

export const config = { port, db };
