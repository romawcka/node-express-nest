import type { RequestListener } from 'node:http';
import { isDatabaseConnected } from './db/mongoose.ts';
import type { Handler } from './helpers/router.helper.ts';
import { sendJson } from './helpers/send.helper.ts';
import { cors } from './middlewares/cors.middleware.ts';
import { logger } from './middlewares/logger.middleware.ts';
import { createHealthRouter } from './routes/health.router.ts';
import { errorHandler } from './middlewares/error-handler.middleware.ts';
import { MongooseTaskRepository } from './repositories/mongoose-task.repository.ts';
import { createTaskRouter } from './routes/task.router.ts';

const notFound: Handler = (_req, res) => {
  sendJson(res, 404, { message: 'Not Found' });
  return true;
};

const taskRepository = new MongooseTaskRepository();

const handlers = [cors, logger, createTaskRouter(taskRepository), createHealthRouter(isDatabaseConnected), notFound];

export const app: RequestListener = async (req, res) => {
  try {
    for (const handler of handlers) {
      if (await handler(req, res)) return;
    }
  } catch (err) {
    errorHandler(err, req, res);
  }
};
