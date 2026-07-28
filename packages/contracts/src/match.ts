import { z } from "zod";
import { idParamSchema } from "./common";
import { dateSchema, matchFormSchema } from "@dragons/shared";

export const matchListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  leagueId: z.coerce.number().int().positive().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  sort: z.enum(["asc", "desc"]).default("asc"),
  hasScore: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  teamApiId: z.coerce.number().int().positive().optional(),
});

// GET /admin/matches shares matchListQuerySchema above and passes the entire
// validated query straight through to getOwnClubMatches — it never
// destructures individual keys. Bounding opponentApiId there directly would
// silently turn it into a live, undocumented admin filter (and turn a
// previously-tolerated unknown `opponentApiId` into a 400, since neither
// schema is .strict()). The public route is the only one with a declared
// opponentApiId filter, so it gets its own schema instead of widening the
// shared one.
export const publicMatchListQuerySchema = matchListQuerySchema.extend({
  opponentApiId: z.coerce.number().int().positive().optional(),
});

export const matchIdParamSchema = idParamSchema;
export const publicMatchIdParamSchema = idParamSchema;

export const matchUpdateBodySchema = matchFormSchema.extend({
  venueId: z.number().int().positive().nullable().optional(),
  homeScore: z.number().int().nullable().optional(),
  guestScore: z.number().int().nullable().optional(),
  homeHalftimeScore: z.number().int().nullable().optional(),
  guestHalftimeScore: z.number().int().nullable().optional(),
  homeQ1: z.number().int().nullable().optional(),
  guestQ1: z.number().int().nullable().optional(),
  homeQ2: z.number().int().nullable().optional(),
  guestQ2: z.number().int().nullable().optional(),
  homeQ3: z.number().int().nullable().optional(),
  guestQ3: z.number().int().nullable().optional(),
  homeQ4: z.number().int().nullable().optional(),
  guestQ4: z.number().int().nullable().optional(),
  // Periods 5-8 exist for the "achtel" format: the columns are in `matches`,
  // `MatchDetail` exposes them, and without them here an achtel match with a
  // wrong period score has no editable path at all.
  homeQ5: z.number().int().nullable().optional(),
  guestQ5: z.number().int().nullable().optional(),
  homeQ6: z.number().int().nullable().optional(),
  guestQ6: z.number().int().nullable().optional(),
  homeQ7: z.number().int().nullable().optional(),
  guestQ7: z.number().int().nullable().optional(),
  homeQ8: z.number().int().nullable().optional(),
  guestQ8: z.number().int().nullable().optional(),
  homeOt1: z.number().int().nullable().optional(),
  guestOt1: z.number().int().nullable().optional(),
  homeOt2: z.number().int().nullable().optional(),
  guestOt2: z.number().int().nullable().optional(),
  changeReason: z.string().optional(),
}).strict();

export const matchHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const releaseOverrideParamsSchema = idParamSchema.extend({
  fieldName: z.string().min(1).max(100),
});

export type MatchListQuery = z.infer<typeof matchListQuerySchema>;
export type PublicMatchListQuery = z.infer<typeof publicMatchListQuerySchema>;
export type MatchUpdateBody = z.infer<typeof matchUpdateBodySchema>;
export type MatchIdParam = z.infer<typeof matchIdParamSchema>;
export type MatchHistoryQuery = z.infer<typeof matchHistoryQuerySchema>;
export type ReleaseOverrideParams = z.infer<typeof releaseOverrideParamsSchema>;
