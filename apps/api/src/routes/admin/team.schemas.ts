import { z } from "zod";

export const teamIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const teamUpdateBodySchema = z.object({
  customName: z.string().max(50).nullable(),
});

export type TeamUpdateBody = z.infer<typeof teamUpdateBodySchema>;
