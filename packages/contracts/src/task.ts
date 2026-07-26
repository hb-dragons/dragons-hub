import { z } from "zod";
import { idParamSchema } from "./common";
import { dateSchema, taskPrioritySchema } from "@dragons/shared";

export const taskBoardIdParamSchema = z.object({
  boardId: z.coerce.number().int().positive(),
});

export const taskIdParamSchema = idParamSchema;

export const taskChecklistItemParamSchema = idParamSchema.extend({
  itemId: z.coerce.number().int().positive(),
});

export const taskCommentParamSchema = idParamSchema.extend({
  commentId: z.coerce.number().int().positive(),
});

export const taskListQuerySchema = z.object({
  columnId: z.coerce.number().int().positive().optional(),
  assigneeId: z.string().min(1).optional(),
  priority: taskPrioritySchema.optional(),
});

export const taskCreateBodySchema = z.strictObject({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullable().optional(),
  assigneeIds: z.array(z.string().min(1).max(100)).optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: dateSchema.nullable().optional(),
  columnId: z.number().int().positive(),
});

export const taskUpdateBodySchema = z.strictObject({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  assigneeIds: z.array(z.string().min(1).max(100)).optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: dateSchema.nullable().optional(),
});

export const taskAssigneeParamSchema = idParamSchema.extend({
  userId: z.string().min(1).max(100),
});

export type TaskAssigneeParam = z.infer<typeof taskAssigneeParamSchema>;

export const taskMoveBodySchema = z.strictObject({
  columnId: z.number().int().positive(),
  position: z.number().int().min(0),
});

export const checklistItemCreateBodySchema = z.strictObject({
  label: z.string().min(1).max(200),
  position: z.number().int().min(0).optional(),
});

export const checklistItemUpdateBodySchema = z.strictObject({
  label: z.string().min(1).max(200).optional(),
  isChecked: z.boolean().optional(),
});

export const commentCreateBodySchema = z.strictObject({
  body: z.string().min(1).max(5000),
});

export const commentUpdateBodySchema = z.strictObject({
  body: z.string().min(1).max(5000),
});

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type TaskCreateBody = z.infer<typeof taskCreateBodySchema>;
export type TaskUpdateBody = z.infer<typeof taskUpdateBodySchema>;
export type TaskMoveBody = z.infer<typeof taskMoveBodySchema>;
export type ChecklistItemCreateBody = z.infer<typeof checklistItemCreateBodySchema>;
export type ChecklistItemUpdateBody = z.infer<typeof checklistItemUpdateBodySchema>;
export type CommentCreateBody = z.infer<typeof commentCreateBodySchema>;
export type CommentUpdateBody = z.infer<typeof commentUpdateBodySchema>;
