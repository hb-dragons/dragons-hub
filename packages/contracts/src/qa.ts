import { z } from "zod";

export const qaChatBodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
  locale: z.string().min(2).max(15).optional(),
});

export type QaChatBody = z.infer<typeof qaChatBodySchema>;
