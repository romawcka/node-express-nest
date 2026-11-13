import type { CreateTaskDto, UpdateTaskDto } from '@rest/contract';
import { desc, eq } from 'drizzle-orm';
import * as z from 'zod';
import { db } from '../db/drizzle.ts';
import { taskTable } from '../models/task.model.ts';
import type { TaskRepository } from './task.repository.ts';

const taskColumns = {
  id: taskTable.id,
  title: taskTable.title,
  isCompleted: taskTable.isCompleted,
};

const isUuid = (id: string) => z.uuid().safeParse(id).success;

export class DrizzleTaskRepository implements TaskRepository {
  async findAll() {
    return await db.select(taskColumns).from(taskTable).orderBy(desc(taskTable.createdAt), desc(taskTable.id));
  }

  async findById(id: string) {
    if (!isUuid(id)) return undefined;

    const [task] = await db.select(taskColumns).from(taskTable).where(eq(taskTable.id, id)).limit(1);

    return task;
  }

  async create(data: CreateTaskDto) {
    const [task] = await db.insert(taskTable).values(data).returning(taskColumns);

    if (!task) {
      throw new Error('INSERT did not return a row');
    }

    return task;
  }

  async update(id: string, data: UpdateTaskDto) {
    if (!isUuid(id)) return undefined;

    const [task] = await db.update(taskTable).set(data).where(eq(taskColumns.id, id)).returning(taskColumns);

    return task;
  }

  async delete(id: string) {
    if (!isUuid(id)) return false;

    const { rowCount } = await db.delete(taskTable).where(eq(taskColumns.id, id));

    return (rowCount ?? 0) > 0;
  }
}
