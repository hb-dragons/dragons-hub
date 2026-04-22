import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const historyFilterSchema = z.object({
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  league: z.string().trim().min(1).optional(),
  status: z.enum(["all", "active", "cancelled", "forfeited"]).default("active"),
});

export const historyGamesQuerySchema = historyFilterSchema.extend({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type HistoryFilterParams = z.infer<typeof historyFilterSchema>;
export type HistoryGamesQueryParams = z.infer<typeof historyGamesQuerySchema>;
