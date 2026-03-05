import { z } from "zod";
import { dateSchema, taskPrioritySchema } from "@dragons/shared";

export const taskBoardIdParamSchema = z.object({
  boardId: z.coerce.number().int().positive(),
});

export const taskIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const taskChecklistItemParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

export const taskCommentParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  commentId: z.coerce.number().int().positive(),
});

export const taskListQuerySchema = z.object({
  columnId: z.coerce.number().int().positive().optional(),
  assigneeId: z.string().min(1).optional(),
  priority: taskPrioritySchema.optional(),
});

export const taskCreateBodySchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullable().optional(),
  assigneeId: z.string().max(100).nullable().optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: dateSchema.nullable().optional(),
  columnId: z.number().int().positive(),
});

export const taskUpdateBodySchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  assigneeId: z.string().max(100).nullable().optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: dateSchema.nullable().optional(),
});

export const taskMoveBodySchema = z.object({
  columnId: z.number().int().positive(),
  position: z.number().int().min(0),
});

export const checklistItemCreateBodySchema = z.object({
  label: z.string().min(1).max(200),
  position: z.number().int().min(0).optional(),
});

export const checklistItemUpdateBodySchema = z.object({
  label: z.string().min(1).max(200).optional(),
  isChecked: z.boolean().optional(),
  checkedBy: z.string().max(100).nullable().optional(),
});

export const commentCreateBodySchema = z.object({
  body: z.string().min(1).max(5000),
  authorId: z.string().min(1).max(100),
});

export const commentUpdateBodySchema = z.object({
  body: z.string().min(1).max(5000),
});

export type TaskCreateBody = z.infer<typeof taskCreateBodySchema>;
export type TaskUpdateBody = z.infer<typeof taskUpdateBodySchema>;
export type TaskMoveBody = z.infer<typeof taskMoveBodySchema>;
export type ChecklistItemCreateBody = z.infer<typeof checklistItemCreateBodySchema>;
export type ChecklistItemUpdateBody = z.infer<typeof checklistItemUpdateBodySchema>;
export type CommentCreateBody = z.infer<typeof commentCreateBodySchema>;
export type CommentUpdateBody = z.infer<typeof commentUpdateBodySchema>;
