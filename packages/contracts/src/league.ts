import { z } from "zod";
import { idParamSchema } from "./common";

export const leagueNumbersSchema = z.strictObject({
  leagueNumbers: z.array(z.number().int().positive()),
});

export const leagueOwnClubRefsSchema = z.strictObject({
  ownClubRefs: z.boolean(),
});

/** Path param for PATCH /admin/settings/leagues/:id/own-club-refs. */
export const leagueIdParamSchema = idParamSchema;

export type LeagueNumbersBody = z.infer<typeof leagueNumbersSchema>;
export type LeagueOwnClubRefsBody = z.infer<typeof leagueOwnClubRefsSchema>;
export type LeagueIdParam = z.infer<typeof leagueIdParamSchema>;
