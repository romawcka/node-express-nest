import type { RequestListener } from 'node:http';
import { config } from './configs/app.config.ts';
import type { Handler } from './helpers/router.helper.ts';
import { sendJson } from './helpers/send.helper.ts';
import { cors } from './middlewares/cors.middleware.ts';
import { errorHandler } from './middlewares/error-handler.middleware.ts';
import { logger } from './middlewares/logger.middleware.ts';
import { FileTaskRepository } from './repositories/file-task.repository.ts';
import { createHealthRouter } from './routes/health.router.ts';
import { createTaskRouter } from './routes/task.router.ts';

const taskRepository = new FileTaskRepository(config.db);

const notFound: Handler = (_req, res) => {
  sendJson(res, 404, { message: 'Not Found' });
  return true;
};

const handlers = [cors, logger, createTaskRouter(taskRepository), createHealthRouter(), notFound];

export const app: RequestListener = async (req, res) => {
  try {
    for (const handler of handlers) {
      if (await handler(req, res)) return;
    }
  } catch (err) {
    errorHandler(err, req, res);
  }
};
