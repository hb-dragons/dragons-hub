import { z } from "zod";

/** Path param identifying the federation match (spielplan id) for assignment routes. */
export const spielplanIdParamSchema = z.object({
  spielplanId: z.coerce.number().int().positive(),
});

/** Pagination query for GET /referee/games/:spielplanId/candidates. */
export const refAssignmentCandidatesQuerySchema = z.object({
  search: z.string().default(""),
  pageFrom: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
  // Out-of-range/invalid slot values fall back to undefined (eligibility "either"),
  // preserving the old route's lenient behavior rather than rejecting with 400.
  slot: z
    .enum(["1", "2"])
    .transform((v) => (v === "1" ? (1 as const) : (2 as const)))
    .optional()
    .catch(undefined),
});

const slotNumberField = z.coerce
  .number()
  .int()
  .refine((n) => n === 1 || n === 2, "slotNumber must be 1 or 2")
  .transform((n) => n as 1 | 2);

/**
 * Combined path params (spielplanId + slotNumber) for
 * DELETE /referee/games/:spielplanId/assignment/:slotNumber.
 */
export const assignmentSlotParamSchema = z.object({
  spielplanId: z.coerce.number().int().positive(),
  slotNumber: slotNumberField,
});

export type SpielplanIdParam = z.infer<typeof spielplanIdParamSchema>;
export type RefAssignmentCandidatesQuery = z.infer<typeof refAssignmentCandidatesQuerySchema>;
export type AssignmentSlotParam = z.infer<typeof assignmentSlotParamSchema>;
