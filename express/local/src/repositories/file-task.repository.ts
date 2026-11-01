import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import type { CreateTaskDto, TaskDto, UpdateTaskDto } from "../types/task.type.ts";
import type { TaskRepository } from "./task.repository.ts";

export class FileTaskRepository implements TaskRepository {
  #file: string;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(file: string) {
    this.#file = file;
  }

  async #read(): Promise<TaskDto[]> {
    try {
      const data = JSON.parse(await readFile(this.#file, "utf-8"));

      if (!Array.isArray(data)) {
        throw new Error(`${this.#file} must contain an array`);
      }

      return data;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  async #write(tasks: TaskDto[]) {
    const tmp = `${this.#file}.tmp`;
    await writeFile(tmp, JSON.stringify(tasks, null, 2) + "\n");
    await rename(tmp, this.#file);
  }

  #mutate<T>(fn: (tasks: TaskDto[]) => T): Promise<T> {
    const run = this.#queue.then(async () => {
      const tasks = await this.#read();
      const result = fn(tasks);
      await this.#write(tasks);
      return result;
    });

    this.#queue = run.catch(() => {});

    return run;
  }

  findAll() {
    return this.#read();
  }

  async findById(id: string) {
    return (await this.#read()).find((task) => task.id === id);
  }

  create(data: CreateTaskDto) {
    return this.#mutate((tasks) => {
      const task: TaskDto = {
        id: randomUUID(),
        title: data.title,
        isCompleted: data.isCompleted,
      };
      tasks.push(task);

      return task;
    });
  }

  update(id: string, data: UpdateTaskDto) {
    return this.#mutate((tasks) => {
      const task = tasks.find((task) => task.id === id);
      if (!task) return;

      task.title = data.title ?? task.title;
      task.isCompleted = data.isCompleted ?? task.isCompleted;

      return task;
    });
  }

  delete(id: string) {
    return this.#mutate((tasks) => {
      const idx = tasks.findIndex((task) => task.id === id);
      if (idx === -1) return false;
      tasks.splice(idx, 1);
      return true;
    });
  }
}
