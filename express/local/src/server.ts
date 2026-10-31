import cors from "cors";
import express from "express";
import morgan from "morgan";
import { config } from "./config/config.ts";
import { errorHandler } from "./middlewares/error-handler.ts";
import { FileTaskRepository } from "./repositories/file-task.repository.ts";
import { healthRouter, taskRouter } from "./routes/_index.ts";

export const app = express();

app.use(cors());
app.use(morgan("tiny"));
app.use(express.json());

const taskRepository = new FileTaskRepository(config.db);

app.use("/tasks", taskRouter(taskRepository));
app.use(healthRouter);
app.use((_req, res) => res.status(404).json({ message: "Not found" }));
app.use(errorHandler);
