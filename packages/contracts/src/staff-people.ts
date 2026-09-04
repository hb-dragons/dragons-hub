import { z } from "zod";
import { idParamSchema } from "./common";

/** `:id` of `/admin/staff-people/:id` — a `staff_people` row id. */
export const staffPersonIdParamSchema = idParamSchema;

export type StaffPersonIdParam = z.infer<typeof staffPersonIdParamSchema>;

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

/**
 * The person: name plus the contact data the club holds on them (ADR 0009).
 * Reused verbatim as the inline person of a team staff assignment, so creating
 * a coach on the spot and creating one in the pool validate identically.
 */
export const staffPersonCreateBodySchema = z.strictObject({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: contactField(phoneSchema),
  email: contactField(emailSchema),
  licence: contactField(licenceSchema),
});

export type StaffPersonCreateBody = z.infer<typeof staffPersonCreateBodySchema>;

/**
 * The create body with every field optional: a patch that omits a key leaves it
 * alone, and `null` (or `""`) on a contact field clears it. Derived rather than
 * restated so the two bodies cannot drift apart field by field.
 */
export const staffPersonUpdateBodySchema = staffPersonCreateBodySchema.partial();

export type StaffPersonUpdateBody = z.infer<typeof staffPersonUpdateBodySchema>;

/** `?q=` of the pool list — a name fragment, matched against either name. */
export const staffPersonListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

export type StaffPersonListQuery = z.infer<typeof staffPersonListQuerySchema>;
