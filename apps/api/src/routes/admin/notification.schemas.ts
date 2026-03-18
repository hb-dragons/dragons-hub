import { z } from "zod";

export const notificationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const notificationListQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const notificationUserIdQuerySchema = z.object({
  userId: z.string().min(1),
});
