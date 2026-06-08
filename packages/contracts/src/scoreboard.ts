import { z } from "zod";

export const scoreboardListQuerySchema = z.object({
  deviceId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  afterId: z.coerce.number().int().min(0).optional(),
});

export type ScoreboardListQuery = z.infer<typeof scoreboardListQuerySchema>;
