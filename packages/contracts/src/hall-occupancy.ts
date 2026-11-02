import { z } from "zod";
import { dateSchema, HALL_TIME_COVERAGES } from "@dragons/shared";

export const hallOccupancyQuerySchema = z.object({
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  venueId: z.coerce.number().int().positive().optional(),
  coverage: z.enum(HALL_TIME_COVERAGES).optional(),
});

export type HallOccupancyQuery = z.infer<typeof hallOccupancyQuerySchema>;
