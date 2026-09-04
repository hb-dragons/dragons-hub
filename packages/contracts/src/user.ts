import { z } from "zod";

export const userRefereeLinkBodySchema = z.strictObject({
  refereeId: z.number().int().positive().nullable(),
});

export type UserRefereeLinkBody = z.infer<typeof userRefereeLinkBodySchema>;

/**
 * The `:id` on `/admin/users/:id/referee-link` is a better-auth text id
 * (`user.id` is `text().primaryKey()`, not a serial int), so this does not
 * alias the shared numeric `idParamSchema`.
 */
export const userIdParamSchema = z.object({
  id: z.string().min(1).max(255),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;

/**
 * Link/unlink body for `/admin/users/:id/staff-link`, the staff mirror of
 * `userRefereeLinkBodySchema`. `grantCoachRole` is optional here rather than
 * defaulted, so the service — not the schema — owns what an omitted flag means;
 * the dialog sends it explicitly either way.
 */
export const userStaffLinkBodySchema = z.strictObject({
  staffId: z.number().int().positive().nullable(),
  grantCoachRole: z.boolean().optional(),
});

export type UserStaffLinkBody = z.infer<typeof userStaffLinkBodySchema>;
