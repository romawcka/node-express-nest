import type { CreateTaskDto, Task, UpdateTaskDto } from "../types/task.type.ts";

export interface TaskRepository {
  findAll(): Promise<Task[]>;
  findById(id: string): Promise<Task | undefined>;
  create(data: CreateTaskDto): Promise<Task>;
  update(id: string, data: UpdateTaskDto): Promise<Task | undefined>;
  delete(id: string): Promise<boolean>;
}
