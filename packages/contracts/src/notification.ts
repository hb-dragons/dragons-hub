import { z } from "zod";
import { idParamSchema } from "./common";
import { USER_TOGGLEABLE_EVENT_TYPES } from "@dragons/shared";

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

// Enumerated rather than a bare string array (issue #156). Muting a type the
// user cannot toggle silences nothing, so it is always a typo. This was
// previously caught two layers down, in `updateUserNotificationPreferences`,
// and turned into a 400 by matching the thrown Error's *message* in the route
// — a coupling nothing checked. Validating here makes the rejection the same
// central 400 every other endpoint emits.
export const notificationPreferencesBodySchema = z.strictObject({
  mutedEventTypes: z.array(z.enum(USER_TOGGLEABLE_EVENT_TYPES)).optional(),
  locale: z.enum(["de", "en"]).optional(),
});

export type NotificationPreferencesBody = z.infer<
  typeof notificationPreferencesBodySchema
>;
