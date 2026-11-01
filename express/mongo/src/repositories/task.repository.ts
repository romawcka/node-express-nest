import type { CreateTaskDto, TaskDto, UpdateTaskDto } from "@rest/contract";

export interface TaskRepository {
  findAll(): Promise<TaskDto[]>;
  findById(id: string): Promise<TaskDto | undefined>;
  create(data: CreateTaskDto): Promise<TaskDto>;
  update(id: string, data: UpdateTaskDto): Promise<TaskDto | undefined>;
  delete(id: string): Promise<boolean>;
}
