import { z } from "zod";
import { idParamSchema } from "./common";

export const notificationIdParamSchema = idParamSchema;

export const notificationListQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationUserIdQuerySchema = z.object({
  userId: z.string().min(1),
});

export const notificationPreferencesBodySchema = z.strictObject({
  mutedEventTypes: z.array(z.string()).optional(),
  locale: z.enum(["de", "en"]).optional(),
});

export type NotificationPreferencesBody = z.infer<
  typeof notificationPreferencesBodySchema
>;
