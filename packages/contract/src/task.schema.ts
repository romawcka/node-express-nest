import * as z from "zod";

const TITLE_REQUIRED = "title is required";
const TITLE_STRING = "title must be a string";
const TITLE_NON_EMPTY = "title must be a non-empty string";
const IS_COMPLETED_BOOLEAN = "isCompleted must be a boolean";
const BODY_JSON = "body must be a JSON object";
const ONE_FIELD_REQUIRED = "at least one field is required";

const TaskSchema = z.object(
  {
    id: z.string(),
    title: z
      .string({
        error: (issue) =>
          issue.input === undefined ? TITLE_REQUIRED : TITLE_STRING,
      })
      .trim()
      .min(1, { error: TITLE_NON_EMPTY }),
    isCompleted: z.boolean({ error: IS_COMPLETED_BOOLEAN }),
  },
  { error: BODY_JSON },
);

export const CreateTaskSchema = TaskSchema.omit({ id: true }).extend({
  isCompleted: TaskSchema.shape.isCompleted.default(false),
});

export const UpdateTaskSchema = TaskSchema.omit({ id: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    error: ONE_FIELD_REQUIRED,
  });

export type Task = z.infer<typeof TaskSchema>;
export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskDto = z.infer<typeof UpdateTaskSchema>;
