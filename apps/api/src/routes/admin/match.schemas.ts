import { z } from "zod";

export const matchListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  leagueId: z.coerce.number().int().positive().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
});

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const matchUpdateBodySchema = z.object({
  kickoffDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .nullable()
    .optional(),
  kickoffTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Must be HH:MM or HH:MM:SS")
    .nullable()
    .optional(),
  isForfeited: z.boolean().nullable().optional(),
  isCancelled: z.boolean().nullable().optional(),
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
  venueNameOverride: z.string().max(200).nullable().optional(),
  anschreiber: z.string().max(100).nullable().optional(),
  zeitnehmer: z.string().max(100).nullable().optional(),
  shotclock: z.string().max(100).nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  publicComment: z.string().nullable().optional(),
  changeReason: z.string().optional(),
});

export const releaseOverrideParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  fieldName: z.string().min(1).max(100),
});

export type MatchListQuery = z.infer<typeof matchListQuerySchema>;
export type MatchUpdateBody = z.infer<typeof matchUpdateBodySchema>;
