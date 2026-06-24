import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const createSeasonSchema = z.object({
  name: z.string().min(1).max(100),
  sdkSeasonId: z.number().int().positive().nullish(),
  startDate: dateString.nullish(),
  endDate: dateString.nullish(),
});

export const seasonIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const browseLeaguesQuerySchema = z.object({
  vorabligaOnly: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const seasonLeaguesSchema = z.object({
  ligaIds: z.array(z.number().int().positive()),
});

export type CreateSeasonBody = z.infer<typeof createSeasonSchema>;
export type SeasonIdParam = z.infer<typeof seasonIdParamSchema>;
export type BrowseLeaguesQuery = z.infer<typeof browseLeaguesQuerySchema>;
export type SeasonLeaguesBody = z.infer<typeof seasonLeaguesSchema>;
