import { CreateTaskSchema, UpdateTaskSchema } from '@rest/contract';
import { createRouter } from '../helpers/router.helper.ts';
import { sendJson } from '../helpers/send.helper.ts';
import type { TaskRepository } from '../repositories/task.repository.ts';
import { readJson } from '../helpers/json-body.helper.ts';

const ROOT_PATH = '/tasks';

export const createTaskRouter = (tasks: TaskRepository) =>
  createRouter([
    {
      method: 'GET',
      path: ROOT_PATH,
      handler: async (_req, res) => sendJson(res, 200, { tasks: await tasks.findAll() }),
    },
    {
      method: 'GET',
      path: `${ROOT_PATH}/:id`,
      handler: async (_req, res, id) => {
        const task = await tasks.findById(id);

        if (!task) {
          return sendJson(res, 404, { message: `Task ${id} not found` });
        }

        sendJson(res, 200, { task });
      },
    },
    {
      method: 'POST',
      path: ROOT_PATH,
      handler: async (req, res) => {
        const { data, success, error } = CreateTaskSchema.safeParse(await readJson(req));

        if (!success) {
          const message = error.issues.map((issue) => issue.message).join('; ');

          return sendJson(res, 400, { message });
        }

        const task = await tasks.create(data);

        sendJson(res, 201, { task });
      },
    },
    {
      method: 'PATCH',
      path: `${ROOT_PATH}/:id`,
      handler: async (req, res, id) => {
        const { data, success, error } = UpdateTaskSchema.safeParse(await readJson(req));

        if (!success) {
          const message = error.issues.map((issue) => issue.message).join('; ');

          return sendJson(res, 400, { message });
        }

        const task = await tasks.update(id, data);

        if (!task) {
          return sendJson(res, 404, { message: `Task ${id} not found` });
        }

        sendJson(res, 200, { task });
      },
    },
    {
      method: 'DELETE',
      path: `${ROOT_PATH}/:id`,
      handler: async (_req, res, id) => {
        if (!(await tasks.delete(id))) {
          return sendJson(res, 404, { message: `Task ${id} not found` });
        }

        sendJson(res, 204);
      },
    },
  ]);
