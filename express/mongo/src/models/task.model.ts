import { model, Schema, type InferSchemaType } from "mongoose";

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    isCompleted: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, versionKey: false },
);

export type TaskDocument = InferSchemaType<typeof taskSchema>;
export const TaskModel = model("Task", taskSchema);
