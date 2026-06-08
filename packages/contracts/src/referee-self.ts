import { z } from "zod";

/**
 * Query params for GET /referee/games.
 * The `league` field accepts a comma-separated string and is transformed into
 * an array of trimmed, non-empty strings on parse.
 */
export const refereeGamesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).optional(),
  status: z.enum(["active", "cancelled", "forfeited", "all"]).default("active"),
  league: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined)),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  gameType: z.enum(["home", "away", "both"]).optional(),
  assignedRefereeApiId: z.coerce.number().int().positive().optional(),
  slotStatus: z.enum(["open", "offered", "any"]).optional(),
});

export type RefereeGamesQuery = z.infer<typeof refereeGamesQuerySchema>;

/**
 * Body for POST /referee/games/:spielplanId/assign.
 * The referee may only assign themselves; the ownership check happens in the
 * route handler after parsing.
 */
export const refereeAssignBodySchema = z.object({
  slotNumber: z.union([z.literal(1), z.literal(2)]),
  refereeApiId: z.number().int().positive(),
});

export type RefereeAssignBody = z.infer<typeof refereeAssignBodySchema>;

/**
 * Body for POST /referee/games/:id/claim.
 * The entire body is optional — an empty body is a valid claim request.
 */
export const refereeClaimBodySchema = z
  .object({
    slotNumber: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .optional();

export type RefereeClaimBody = z.infer<typeof refereeClaimBodySchema>;
