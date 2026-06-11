import { z } from "zod";

export const scoreboardListQuerySchema = z.object({
  deviceId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  afterId: z.coerce.number().int().min(0).optional(),
});

export type ScoreboardListQuery = z.infer<typeof scoreboardListQuerySchema>;

/**
 * The numeric `Last-Event-ID` header for SSE reconnection on
 * GET /public/scoreboard/stream. A positive int when present; absent or
 * malformed values yield `undefined` so reconnection degrades gracefully
 * (a malformed header must NOT reject the stream).
 */
export const scoreboardLastEventIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .catch(undefined);

export type ScoreboardLastEventId = z.infer<typeof scoreboardLastEventIdSchema>;
