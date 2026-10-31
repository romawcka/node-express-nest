export interface Task {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface CreateTaskDto {
  isCompleted?: boolean;
  title: string;
}

export type UpdateTaskDto = Partial<Omit<Task, "id">>;
