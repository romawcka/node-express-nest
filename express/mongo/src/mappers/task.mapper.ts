import type { Types } from "mongoose";
import type { TaskDocument } from "../models/task.model.ts";
import type { TaskDto } from "@rest/contract";

type TaskWithId = TaskDocument & { _id: Types.ObjectId };

export const toTaskDto = (task: TaskWithId): TaskDto => ({
  id: task._id.toHexString(),
  title: task.title,
  isCompleted: task.isCompleted,
});
