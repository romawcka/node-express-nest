import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const taskTable = pgTable('tasks', {
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`),
  title: text().notNull(),
  isCompleted: boolean('is_completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
