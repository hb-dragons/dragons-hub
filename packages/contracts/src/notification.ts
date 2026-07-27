import { z } from "zod";
import { idParamSchema } from "./common";

export const notificationIdParamSchema = idParamSchema;

// No userId: the notification log is read as the caller, never as a user named
// by the request (issue #123 — cross-user reads are not intended). The route
// takes the recipient from the session. Query schemas are non-strict here as
// everywhere else in this package, so a leftover `?userId=` is stripped by the
// parse rather than rejected — it can never reach the handler either way.
export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationPreferencesBodySchema = z.strictObject({
  mutedEventTypes: z.array(z.string()).optional(),
  locale: z.enum(["de", "en"]).optional(),
});

export type NotificationPreferencesBody = z.infer<
  typeof notificationPreferencesBodySchema
>;
