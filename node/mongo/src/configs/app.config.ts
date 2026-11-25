const MONGO_URL_DEFAULT = 'mongodb://root:root@localhost:27017/rest_node?authSource=admin';

const port = parseInt(process.env.PORT ?? '3102');
const mongoUrl = process.env.MONGO_URL ?? MONGO_URL_DEFAULT;

export const config = { port, mongoUrl };
