import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { TaskPriority } from "@dragons/shared";
import { boards, boardColumns } from "./boards";

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    boardId: integer("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    columnId: integer("column_id")
      .notNull()
      .references(() => boardColumns.id),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    assigneeId: text("assignee_id"),
    priority: varchar("priority", { length: 10 }).notNull().default("normal").$type<TaskPriority>(),
    dueDate: date("due_date"),
    position: integer("position").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    boardIdIdx: index("tasks_board_id_idx").on(table.boardId),
    columnIdIdx: index("tasks_column_id_idx").on(table.columnId),
    assigneeIdx: index("tasks_assignee_idx").on(table.assigneeId),
    dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
  }),
);

export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 200 }).notNull(),
    isChecked: boolean("is_checked").notNull().default(false),
    checkedBy: text("checked_by"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    taskIdIdx: index("task_checklist_items_task_id_idx").on(table.taskId),
  }),
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    taskIdIdx: index("task_comments_task_id_idx").on(table.taskId),
  }),
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskChecklistItem = typeof taskChecklistItems.$inferSelect;
export type NewTaskChecklistItem = typeof taskChecklistItems.$inferInsert;
export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;
