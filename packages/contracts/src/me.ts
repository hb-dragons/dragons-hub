import { z } from "zod";
import { staffPersonCreateBodySchema } from "./staff-people";

/**
 * What a coach may change about themselves through `PATCH /me/staff` (#315).
 *
 * Picked from the person contract rather than restated, so the three fields
 * validate exactly as they do in the admin editor — and so a field that leaves
 * the person contract cannot linger here. Everything not picked (name, and
 * with it the portrait and the team assignments, which have their own routes)
 * is rejected by the inherited strictness: the club owns who someone is and
 * which team they train; the coach owns how to reach them.
 */
export const meStaffUpdateBodySchema = staffPersonCreateBodySchema.pick({
  phone: true,
  email: true,
  licence: true,
});

export type MeStaffUpdateBody = z.infer<typeof meStaffUpdateBodySchema>;

/**
 * Body of `POST /me/account-closure` (#400): nothing. The account is the
 * session's, so there is no id to send and none to tamper with; strict so a
 * client that starts sending one fails loudly instead of being ignored.
 */
export const meAccountClosureCreateBodySchema = z.strictObject({});

export type MeAccountClosureCreateBody = z.infer<typeof meAccountClosureCreateBodySchema>;
