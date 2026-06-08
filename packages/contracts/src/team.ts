import { z } from "zod";

export const teamIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const teamUpdateBodySchema = z.object({
  customName: z.string().max(50).nullable().optional(),
  estimatedGameDuration: z.number().int().positive().nullable().optional(),
  badgeColor: z.string().max(20).nullable().optional(),
});

export type TeamUpdateBody = z.infer<typeof teamUpdateBodySchema>;

export const teamReorderBodySchema = z.object({
  teamIds: z.array(z.number().int().positive()).min(1),
});

export type TeamReorderBody = z.infer<typeof teamReorderBodySchema>;
