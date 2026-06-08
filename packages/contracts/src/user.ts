import { z } from "zod";

export const userRefereeLinkBodySchema = z.object({
  refereeId: z.number().int().positive().nullable(),
});

export type UserRefereeLinkBody = z.infer<typeof userRefereeLinkBodySchema>;
