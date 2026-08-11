import { z } from "zod";
import { idParamSchema } from "./common";

export const leagueOwnClubRefsSchema = z.strictObject({
  ownClubRefs: z.boolean(),
});

/** Path param for PATCH /admin/settings/leagues/:id/own-club-refs. */
export const leagueIdParamSchema = idParamSchema;

export type LeagueOwnClubRefsBody = z.infer<typeof leagueOwnClubRefsSchema>;
export type LeagueIdParam = z.infer<typeof leagueIdParamSchema>;

/** Path param for GET /admin/leagues/:ligaId/teams (federation ligaId). */
export const ligaIdParamSchema = z.object({
  ligaId: z.coerce.number().int().positive(),
});

export type LigaIdParam = z.infer<typeof ligaIdParamSchema>;
