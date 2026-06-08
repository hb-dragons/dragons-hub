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
