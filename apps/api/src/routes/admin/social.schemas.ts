import { z } from "zod";

export const matchesQuerySchema = z.object({
  type: z.enum(["preview", "results"]),
  week: z.coerce.number().int().min(1).max(53),
  year: z.coerce.number().int().min(2020).max(2100),
});

export type MatchesQuery = z.infer<typeof matchesQuerySchema>;

export const generateBodySchema = z.object({
  type: z.enum(["preview", "results"]),
  calendarWeek: z.number().int().min(1).max(53),
  year: z.number().int().min(2020).max(2100),
  matches: z
    .array(
      z.object({
        matchId: z.number().int(),
        order: z.number().int(),
      }),
    )
    .min(1)
    .max(6),
  playerPhotoId: z.number().int(),
  backgroundId: z.number().int(),
  playerPosition: z.object({
    x: z.number(),
    y: z.number(),
    scale: z.number().min(0.1).max(5),
  }),
});

export type GenerateBody = z.infer<typeof generateBodySchema>;

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
