const MONGO_URL_DEFAULT =
  "mongodb://root:root@localhost:27017/rest_express?authSource=admin";

const port = parseInt(process.env.PORT ?? "3202");
const mongoUrl = process.env.MONGO_URL ?? MONGO_URL_DEFAULT;

export const config = { port, mongoUrl };
