import { z } from "zod";

export const boardIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const boardCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  createdBy: z.string().max(100).nullable().optional(),
});

export const boardUpdateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const columnIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  colId: z.coerce.number().int().positive(),
});

export const columnCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000")
    .nullable()
    .optional(),
  isDoneColumn: z.boolean().optional(),
});

export const columnUpdateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  position: z.number().int().min(0).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000")
    .nullable()
    .optional(),
  isDoneColumn: z.boolean().optional(),
});

export const columnReorderBodySchema = z.object({
  columns: z
    .array(
      z.object({
        id: z.number().int().positive(),
        position: z.number().int().min(0),
      }),
    )
    .min(1),
});

export type BoardCreateBody = z.infer<typeof boardCreateBodySchema>;
export type BoardUpdateBody = z.infer<typeof boardUpdateBodySchema>;
export type ColumnCreateBody = z.infer<typeof columnCreateBodySchema>;
export type ColumnUpdateBody = z.infer<typeof columnUpdateBodySchema>;
export type ColumnReorderBody = z.infer<typeof columnReorderBodySchema>;
