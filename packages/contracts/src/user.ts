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
