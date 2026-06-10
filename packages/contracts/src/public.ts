import { z } from "zod";
import { dateSchema } from "@dragons/shared";

export const publicScheduleIcsQuerySchema = z.object({
  teamApiId: z.coerce.number().int().positive().optional(),
  leagueId: z.coerce.number().int().positive().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export type PublicScheduleIcsQuery = z.infer<typeof publicScheduleIcsQuerySchema>;
