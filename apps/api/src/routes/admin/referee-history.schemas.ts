import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const statusValue = z.enum(["played", "cancelled", "forfeited"]);
export type HistoryStatusValue = z.infer<typeof statusValue>;

// Accept:
//   - undefined | "" | "all"   → []
//   - "active"                 → ["played"]  (legacy alias)
//   - "played,cancelled,..."   → parsed array, each value validated
const statusField = z
  .union([z.string(), z.undefined()])
  .transform((raw, ctx) => {
    if (raw === undefined || raw === "" || raw === "all") return [];
    if (raw === "active") return ["played"] as HistoryStatusValue[];
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const result: HistoryStatusValue[] = [];
    for (const p of parts) {
      const r = statusValue.safeParse(p);
      if (!r.success) {
        ctx.addIssue({ code: "custom", message: `invalid status "${p}"` });
        return z.NEVER;
      }
      result.push(r.data);
    }
    return result;
  });

export const historyFilterSchema = z.object({
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  league: z.string().trim().min(1).optional(),
  status: statusField,
});

export const historyGamesQuerySchema = historyFilterSchema.extend({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  refereeApiId: z.coerce.number().int().positive().optional(),
});

export type HistoryFilterParams = z.infer<typeof historyFilterSchema>;
export type HistoryGamesQueryParams = z.infer<typeof historyGamesQuerySchema>;
