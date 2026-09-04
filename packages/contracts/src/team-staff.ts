import { z } from "zod";
import { TEAM_STAFF_ROLES } from "@dragons/shared";
import { idParamSchema } from "./common";
import { staffPersonCreateBodySchema } from "./staff-people";

/** `/admin/teams/:id/staff/:staffId` — the entry id plus the assignment it addresses. */
export const teamStaffParamSchema = idParamSchema.extend({
  staffId: z.coerce.number().int().positive(),
});

/** Derived from the shared array, never restated — the value set is decided once. */
const teamStaffRoleSchema = z.enum(TEAM_STAFF_ROLES);

/** The two fields the assignment itself owns, shared by both create shapes. */
const assignmentFields = {
  role: teamStaffRoleSchema,
  refereeContact: z.boolean().optional(),
};

/**
 * Attaching a person to a team entry (ADR 0009): either a person the club
 * already knows, or a new one filled in during the same step. A union rather
 * than one object with two optional keys, so "both" and "neither" are rejected
 * by the shape itself and the server narrows on the key instead of asserting.
 *
 * The contact data of an *existing* person is deliberately not writable here —
 * it belongs to the person and is edited through `/admin/staff-people/:id`, so
 * one team can never overwrite what another team's admin corrected.
 */
export const teamStaffCreateBodySchema = z.union([
  z.strictObject({ personId: z.number().int().positive(), ...assignmentFields }),
  z.strictObject({ person: staffPersonCreateBodySchema, ...assignmentFields }),
]);

export type TeamStaffCreateBody = z.infer<typeof teamStaffCreateBodySchema>;

/**
 * The assignment's own two fields. Not derived from the create body: a patch
 * may not move an assignment to a different person — removing it and adding
 * the other person is the operation that means that.
 */
export const teamStaffUpdateBodySchema = z.strictObject({
  role: teamStaffRoleSchema.optional(),
  refereeContact: z.boolean().optional(),
});

export type TeamStaffUpdateBody = z.infer<typeof teamStaffUpdateBodySchema>;
