import { z } from "zod";
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

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

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
  homeOt1: z.number().int().nullable().optional(),
  guestOt1: z.number().int().nullable().optional(),
  homeOt2: z.number().int().nullable().optional(),
  guestOt2: z.number().int().nullable().optional(),
  changeReason: z.string().optional(),
});

export const releaseOverrideParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  fieldName: z.string().min(1).max(100),
});

export type MatchListQuery = z.infer<typeof matchListQuerySchema>;
export type MatchUpdateBody = z.infer<typeof matchUpdateBodySchema>;
