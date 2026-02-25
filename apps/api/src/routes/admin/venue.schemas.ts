import { z } from "zod";

export const venueSearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
