import { CreateTaskSchema, UpdateTaskSchema } from "@rest/contract";
import { Router } from "express";
import type { TaskRepository } from "../repositories/task.repository.ts";

export const createTaskRouter = (tasks: TaskRepository) => {
  const router = Router();

  router.get("/", async (_req, res) =>
    res.json({ tasks: await tasks.findAll() }),
  );

  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    const task = await tasks.findById(id);

    if (!task) {
      return res.status(404).json({ message: `Task ${id} not found` });
    }

    res.json({ task });
  });

  router.post("/", async (req, res) => {
    const { data, success, error } = CreateTaskSchema.safeParse(req.body);

    if (!success) {
      const message = error.issues.map((issue) => issue.message).join("; ");
      return res.status(400).json({ message });
    }

    const task = await tasks.create(data);

    res.status(201).json({ task });
  });

  router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const { data, success, error } = UpdateTaskSchema.safeParse(req.body);

    if (!success) {
      const message = error.issues.map((issue) => issue.message).join("; ");
      return res.status(400).json({ message });
    }

    const task = await tasks.update(id, data);

    if (!task) {
      return res.status(404).json({ message: `Task ${id} not found` });
    }

    res.status(200).json({ task });
  });

  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    if (!(await tasks.delete(id))) {
      return res.status(404).json({ message: `Task ${id} not found` });
    }

    res.status(204).end();
  });

  return router;
};
