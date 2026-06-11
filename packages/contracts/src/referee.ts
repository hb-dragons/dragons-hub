import { z } from "zod";

export const refereeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).optional(),
  scope: z.enum(["own", "all"]).default("own"),
  sort: z.enum(["name", "workloadAsc", "workloadDesc"]).default("name"),
});

export type RefereeListQuery = z.infer<typeof refereeListQuerySchema>;

export const refereeVisibilityBodySchema = z.object({
  allowAllHomeGames: z.boolean(),
  allowAwayGames: z.boolean(),
  isOwnClub: z.boolean(),
});

export type RefereeVisibilityBody = z.infer<typeof refereeVisibilityBodySchema>;

/** Path param for GET /referee/games/by-api-match/:apiMatchId */
export const refereeApiMatchParamSchema = z.object({
  apiMatchId: z.coerce.number().int().positive(),
});

/** Path param for GET /referee/matches/:matchId */
export const refereeMatchIdParamSchema = z.object({
  matchId: z.coerce.number().int().positive(),
});

/** Path param for GET /referee/games/:id */
export const refereeGameIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type RefereeApiMatchParam = z.infer<typeof refereeApiMatchParamSchema>;
export type RefereeMatchIdParam = z.infer<typeof refereeMatchIdParamSchema>;
export type RefereeGameIdParam = z.infer<typeof refereeGameIdParamSchema>;
