import cors from "cors";
import express from "express";
import morgan from "morgan";

import { isDatabaseConnected } from "./db/mongoose.ts";
import { errorHandler } from "./middlewares/error-handler.middleware.ts";
import { MongooseTaskRepository } from "./repositories/mongoose-task.repository.ts";
import { createHealthRouter } from "./routes/health.router.ts";
import { createTaskRouter } from "./routes/task.router.ts";

export const app = express();

app.use(cors());
app.use(morgan("tiny"));
app.use(express.json());

app.use("/tasks", createTaskRouter(new MongooseTaskRepository()));
app.use(createHealthRouter(() => isDatabaseConnected()));

app.use((_req, res) => res.status(404).json({ message: "Not found" }));
app.use(errorHandler);
