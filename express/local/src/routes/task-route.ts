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
      res.status(404).json({ message: `Task ${id} not found` });
      return;
    }

    res.json({ task });
  });

  router.post("/", async (req, res) => {
    const { title, isCompleted } = req.body ?? {};

    if (typeof title !== "string" || !title.trim()) {
      res.status(400).json({ message: "title must be a non-empty string" });
      return;
    }

    if (isCompleted !== undefined && typeof isCompleted !== "boolean") {
      res.status(400).json({ message: "isCompleted must be a boolean" });
      return;
    }

    const task = await tasks.create({ title, isCompleted });

    res.status(201).json({ task });
  });

  router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const { title, isCompleted } = req.body ?? {};

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      res.status(400).json({ message: "title must be a non-empty string" });
      return;
    }

    if (isCompleted !== undefined && typeof isCompleted !== "boolean") {
      res.status(400).json({ message: "isCompleted must be a boolean" });
      return;
    }

    const task = await tasks.update(id, { title, isCompleted });

    if (!task) {
      res.status(404).json({ message: `Task ${id} not found` });
      return;
    }

    res.status(200).json({ task });
  });

  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    if (!(await tasks.delete(id))) {
      res.status(404).json({ message: `Task ${id} not found` });
      return;
    }

    res.sendStatus(204);
  });

  return router;
};
