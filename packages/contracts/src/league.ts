import { z } from "zod";

export const leagueNumbersSchema = z.object({
  leagueNumbers: z.array(z.number().int().positive()),
});

export const leagueOwnClubRefsSchema = z.object({
  ownClubRefs: z.boolean(),
});

/** Path param for PATCH /admin/settings/leagues/:id/own-club-refs. */
export const leagueIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type LeagueNumbersBody = z.infer<typeof leagueNumbersSchema>;
export type LeagueOwnClubRefsBody = z.infer<typeof leagueOwnClubRefsSchema>;
export type LeagueIdParam = z.infer<typeof leagueIdParamSchema>;
