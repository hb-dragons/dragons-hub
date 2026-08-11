import { z } from "zod";

/**
 * Query for GET /admin/standings.
 *
 * Admin-only. The public standings route shares the same service but never
 * accepts a season from the caller — it is pinned to the active one — so the
 * parameter is declared here rather than on a schema both routes use.
 */
export const standingsListQuerySchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
});

export type StandingsListQuery = z.infer<typeof standingsListQuerySchema>;
