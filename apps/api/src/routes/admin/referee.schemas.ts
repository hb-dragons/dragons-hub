import { z } from "zod";

export const refereeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).optional(),
  ownClub: z
    .string()
    .optional()
    .transform((v) => v !== "false")
    .default(true),
});

export type RefereeListQuery = z.infer<typeof refereeListQuerySchema>;
