import type { CreateTaskDto, TaskDto, UpdateTaskDto } from '@rest/contract';
import { ConflictError, NotFoundError } from '../errors/app.error.ts';
import type { TaskRepository } from '../repositories/task.repository.ts';

export class TaskService {
  #tasks: TaskRepository;
  constructor(tasks: TaskRepository) {
    this.#tasks = tasks;
  }

  async getAll(): Promise<TaskDto[]> {
    return this.#tasks.findAll();
  }

  async getById(id: string): Promise<TaskDto> {
    const task = await this.#tasks.findById(id);

    if (!task) {
      throw new NotFoundError(`Task ${id} not found`);
    }

    return task;
  }

  async create(data: CreateTaskDto): Promise<TaskDto> {
    return this.#tasks.create(data);
  }

  async update(id: string, data: UpdateTaskDto): Promise<TaskDto> {
    const current = await this.getById(id);
    const isRenaming = data.title !== undefined && data.title !== current.title;
    const staysCompleted = current.isCompleted && data.isCompleted !== false;

    if (isRenaming && staysCompleted) {
      throw new ConflictError('Completed task cannot be renamed');
    }

    const task = await this.#tasks.update(id, data);

    if (!task) {
      throw new NotFoundError(`Task ${id} not found`);
    }

    return task;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.#tasks.delete(id))) {
      throw new NotFoundError(`Task ${id} not found`);
    }
  }
}
