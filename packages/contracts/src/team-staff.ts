import { z } from "zod";
import { idParamSchema } from "./common";

/** `/admin/teams/:id/staff/:staffId` — the entry id plus the staff row it addresses. */
export const teamStaffParamSchema = idParamSchema.extend({
  staffId: z.coerce.number().int().positive(),
});

export type TeamStaffParam = z.infer<typeof teamStaffParamSchema>;

export const teamStaffRoleSchema = z.enum(["trainer", "co_trainer"]);

/**
 * An optional, nullable contact field. The editor sends a cleared input as `""`
 * rather than dropping the key, so an empty string means "clear it" — without
 * this the email validator would reject a cleared email field outright.
 */
function contactField(schema: z.ZodType<string>) {
  return z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable())
    .optional();
}

const nameSchema = z.string().trim().min(1).max(100);
const phoneSchema = z.string().trim().max(50);
const emailSchema = z.email().max(255);
const licenceSchema = z.string().trim().max(100);

export const teamStaffCreateBodySchema = z.strictObject({
  firstName: nameSchema,
  lastName: nameSchema,
  role: teamStaffRoleSchema,
  phone: contactField(phoneSchema),
  email: contactField(emailSchema),
  licence: contactField(licenceSchema),
  refereeContact: z.boolean().optional(),
});

export type TeamStaffCreateBody = z.infer<typeof teamStaffCreateBodySchema>;

/**
 * Every field optional, none nullable that the column is NOT NULL for — a patch
 * that omits a key leaves it alone, and `null` on a contact field clears it.
 */
export const teamStaffUpdateBodySchema = z.strictObject({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  role: teamStaffRoleSchema.optional(),
  phone: contactField(phoneSchema),
  email: contactField(emailSchema),
  licence: contactField(licenceSchema),
  refereeContact: z.boolean().optional(),
});

export type TeamStaffUpdateBody = z.infer<typeof teamStaffUpdateBodySchema>;
