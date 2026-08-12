import { z } from "zod";
import { idParamSchema } from "./common";

export const teamIdParamSchema = idParamSchema;

export const teamUpdateBodySchema = z.strictObject({
  customName: z.string().max(50).nullable().optional(),
  estimatedGameDuration: z.number().int().positive().nullable().optional(),
  badgeColor: z.string().max(20).nullable().optional(),
  leagueId: z.number().int().positive().nullable().optional(),
});

export type TeamUpdateBody = z.infer<typeof teamUpdateBodySchema>;

export const teamReorderBodySchema = z.strictObject({
  seasonId: z.coerce.number().int().positive().optional(),
  entryIds: z.array(z.number().int().positive()).min(1),
});

export type TeamReorderBody = z.infer<typeof teamReorderBodySchema>;

export const teamsListQuerySchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
});

export type TeamsListQuery = z.infer<typeof teamsListQuerySchema>;
