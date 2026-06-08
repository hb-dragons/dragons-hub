import { z } from "zod";

export const leagueNumbersSchema = z.object({
  leagueNumbers: z.array(z.number().int().positive()),
});

export const leagueOwnClubRefsSchema = z.object({
  ownClubRefs: z.boolean(),
});

export type LeagueNumbersBody = z.infer<typeof leagueNumbersSchema>;
export type LeagueOwnClubRefsBody = z.infer<typeof leagueOwnClubRefsSchema>;
