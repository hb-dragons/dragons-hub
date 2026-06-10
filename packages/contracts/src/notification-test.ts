import { z } from "zod";

export const notificationTestSendBodySchema = z.object({
  message: z.string().min(1).max(180).optional(),
});

export type NotificationTestSendBody = z.infer<typeof notificationTestSendBodySchema>;
