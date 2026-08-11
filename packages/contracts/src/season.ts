import { z } from "zod";
import { idParamSchema } from "./common";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const createSeasonSchema = z.strictObject({
  name: z.string().min(1).max(100),
  sdkSeasonId: z.number().int().positive().nullish(),
  startDate: dateString.nullish(),
  endDate: dateString.nullish(),
});

/** Path param for the `/admin/seasons/:id` routes. */
export const seasonIdParamSchema = idParamSchema;

const optionalBoolFromQuery = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

export const browseLeaguesQuerySchema = z.object({
  vorabligaOnly: optionalBoolFromQuery,
  // Narrow the result to leagues our own club actually plays in.
  ownClubOnly: optionalBoolFromQuery,
});

export const seasonLeaguesSchema = z.strictObject({
  ligaIds: z.array(z.number().int().positive()),
});

export type CreateSeasonBody = z.infer<typeof createSeasonSchema>;
export type SeasonIdParam = z.infer<typeof seasonIdParamSchema>;
export type BrowseLeaguesQuery = z.infer<typeof browseLeaguesQuerySchema>;
export type SeasonLeaguesBody = z.infer<typeof seasonLeaguesSchema>;
