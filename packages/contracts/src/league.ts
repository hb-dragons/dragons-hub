import { z } from "zod";

export const leagueOwnClubRefsSchema = z.object({
  ownClubRefs: z.boolean(),
});

/** Path param for PATCH /admin/settings/leagues/:id/own-club-refs. */
export const leagueIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type LeagueOwnClubRefsBody = z.infer<typeof leagueOwnClubRefsSchema>;
export type LeagueIdParam = z.infer<typeof leagueIdParamSchema>;

/** Path param for GET /admin/leagues/:ligaId/teams (federation ligaId). */
export const ligaIdParamSchema = z.object({
  ligaId: z.coerce.number().int().positive(),
});

export type LigaIdParam = z.infer<typeof ligaIdParamSchema>;
