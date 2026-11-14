import { CreateTaskSchema, UpdateTaskSchema } from '@rest/contract';
import { Router } from 'express';
import { validateBody } from '../middlewares/validate-body.middleware.ts';
import type { TaskService } from '../services/task.service.ts';

export const createTaskRouter = (service: TaskService) => {
  const router = Router();

  router.get('/', async (_req, res) => res.json({ tasks: await service.getAll() }));

  router.get('/:id', async (req, res) => res.json({ task: await service.getById(req.params.id) }));

  router.post('/', validateBody(CreateTaskSchema), async (req, res) =>
    res.status(201).json({ task: await service.create(req.body) }),
  );

  router.patch('/:id', validateBody(UpdateTaskSchema), async (req, res) =>
    res.json({ task: await service.update(req.params.id as string, req.body) }),
  );

  router.delete('/:id', async (req, res) => {
    await service.delete(req.params.id);
    return res.status(204).end();
  });

  return router;
};
