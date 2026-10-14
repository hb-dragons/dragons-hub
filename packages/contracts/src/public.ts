import { z } from "zod";
import { dateSchema } from "@dragons/shared";
import { idParamSchema } from "./common";

export const publicTeamIdParamSchema = idParamSchema;

/** `:id` of `GET /public/staff/:id/photo` — a team_staff row id. */
export const publicStaffIdParamSchema = idParamSchema;

const squadApiId = z.coerce.number().int().positive();

/**
 * `teamApiId` is the squad's federation id (`apiTeamPermanentId`) and may
 * repeat: `?teamApiId=12&teamApiId=34` narrows the feed to those squads'
 * games. Hono hands a single occurrence over as a string and repeats as an
 * array, so the schema lifts both to a list. No `teamApiId` means every
 * Dragons game.
 */
export const publicScheduleIcsQuerySchema = z.object({
  teamApiId: z
    .preprocess(
      (value) => (value === undefined || Array.isArray(value) ? value : [value]),
      z.array(squadApiId).optional(),
    ),
  leagueId: z.coerce.number().int().positive().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export type PublicScheduleIcsQuery = z.infer<typeof publicScheduleIcsQuerySchema>;
