import type { Types } from "mongoose";
import type { TaskDocument } from "../model/task.model.ts";
import type { TaskDto } from "../types/task.type.ts";

type TaskWithId = TaskDocument & { _id: Types.ObjectId };

export const toTaskDto = (task: TaskWithId): TaskDto => ({
  id: task._id.toHexString(),
  title: task.title,
  isCompleted: task.isCompleted,
});
