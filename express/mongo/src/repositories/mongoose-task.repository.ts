import type { CreateTaskDto, UpdateTaskDto } from "@rest/contract";
import { isObjectIdOrHexString } from "mongoose";
import { toTaskDto } from "../mappers/task.mapper.ts";
import { TaskModel } from "../models/task.model.ts";
import type { TaskRepository } from "./task.repository.ts";

export class MongooseTaskRepository implements TaskRepository {
  async findAll() {
    const tasks = await TaskModel.find().sort({ createdAt: -1 }).lean();

    return tasks.map(toTaskDto);
  }

  async findById(id: string) {
    if (!isObjectIdOrHexString(id)) return undefined;

    const task = await TaskModel.findById(id).lean();

    return task ? toTaskDto(task) : undefined;
  }

  async create(data: CreateTaskDto) {
    const task = await TaskModel.create(data);

    return toTaskDto(task);
  }

  async update(id: string, data: UpdateTaskDto) {
    if (!isObjectIdOrHexString(id)) return undefined;

    const task = await TaskModel.findByIdAndUpdate(id, data, {
      returnDocument: "after",
    }).lean();

    return task ? toTaskDto(task) : undefined;
  }

  async delete(id: string) {
    if (!isObjectIdOrHexString(id)) return false;

    const { deletedCount } = await TaskModel.deleteOne({ _id: id });

    return Boolean(deletedCount);
  }
}
