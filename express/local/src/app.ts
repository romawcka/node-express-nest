import cors from "cors";
import express from "express";
import morgan from "morgan";

import { config } from "./config/app.config.ts";
import { errorHandler } from "./middlewares/error-handler.middleware.ts";
import { FileTaskRepository } from "./repositories/file-task.repository.ts";
import { createHealthRouter } from "./routes/health.router.ts";
import { createTaskRouter } from "./routes/task.router.ts";

export const app = express();

app.use(cors());
app.use(morgan("tiny"));
app.use(express.json());

const taskRepository = new FileTaskRepository(config.db);

app.use("/tasks", createTaskRouter(taskRepository));
app.use(createHealthRouter());
app.use((_req, res) => res.status(404).json({ message: "Not found" }));
app.use(errorHandler);
