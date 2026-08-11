import { z } from "zod";

/**
 * The `:id` path parameter, shared by every route group that has one.
 *
 * This exact object literal was written out verbatim in fourteen contract
 * files. Each group still exports its own domain-named alias (so call sites and
 * the OpenAPI descriptions keep reading naturally), but they all resolve to
 * this schema — coercion, integer-ness and the positivity bound are decided
 * once. Groups whose params carry more than an id build on it with `.extend()`.
 */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type IdParam = z.infer<typeof idParamSchema>;
