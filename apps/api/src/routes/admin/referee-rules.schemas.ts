import { z } from "zod";

export const refereeRulesParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const ruleItemSchema = z
  .object({
    teamId: z.number().int().positive(),
    deny: z.boolean(),
    allowSr1: z.boolean(),
    allowSr2: z.boolean(),
  })
  .refine((rule) => rule.deny || rule.allowSr1 || rule.allowSr2, {
    message: "Deny must be true, or at least one of allowSr1/allowSr2 must be true",
  });

export const updateRefereeRulesBodySchema = z.object({
  rules: z.array(ruleItemSchema).refine(
    (rules) => {
      const teamIds = rules.map((r) => r.teamId);
      return new Set(teamIds).size === teamIds.length;
    },
    { message: "Duplicate teamId entries are not allowed" },
  ),
});

export type RefereeRulesParam = z.infer<typeof refereeRulesParamSchema>;
export type UpdateRefereeRulesBodyParsed = z.infer<typeof updateRefereeRulesBodySchema>;
