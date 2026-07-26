import { z } from "zod";
import { idParamSchema } from "./common";

export const teamIdParamSchema = idParamSchema;

export const teamUpdateBodySchema = z.strictObject({
  customName: z.string().max(50).nullable().optional(),
  estimatedGameDuration: z.number().int().positive().nullable().optional(),
  badgeColor: z.string().max(20).nullable().optional(),
});

export type TeamUpdateBody = z.infer<typeof teamUpdateBodySchema>;

export const teamReorderBodySchema = z.strictObject({
  teamIds: z.array(z.number().int().positive()).min(1),
});

export type TeamReorderBody = z.infer<typeof teamReorderBodySchema>;
