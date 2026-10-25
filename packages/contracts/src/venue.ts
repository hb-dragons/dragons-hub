import { z } from "zod";
import { idParamSchema } from "./common";
import { dateSchema, timeSchema, HALL_TIME_KINDS } from "@dragons/shared";

export const venueSearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export type VenueSearchQuery = z.infer<typeof venueSearchQuerySchema>;

export const venueIdParamSchema = idParamSchema;

export const hallTimeDateParamSchema = idParamSchema.extend({
  date: dateSchema,
});

export const hallTimeListQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "from must not be after to",
    path: ["to"],
  });

const hhmm = timeSchema.transform((t) => t.slice(0, 5));

function windowOrdered(v: { kind: string; startTime: string | null; endTime: string | null }) {
  if (v.kind === "closed") return true;
  return v.startTime !== null && v.endTime !== null && v.startTime < v.endTime;
}

const hallTimeWindowShape = {
  kind: z.enum(HALL_TIME_KINDS),
  startTime: hhmm.nullable(),
  endTime: hhmm.nullable(),
  note: z.string().max(500).nullable(),
};
const windowRefinement = {
  message: "an open day needs startTime < endTime",
  path: ["endTime"] as string[],
};

/** Body of PUT /admin/venues/:id/hall-times/:date — the date is in the path. */
export const hallTimeUpsertBodySchema = z
  .strictObject(hallTimeWindowShape)
  .refine(windowOrdered, windowRefinement);

/** One day as the sheet parser hands it in: the window plus its date. */
export const hallTimeInputSchema = z
  .strictObject({ date: dateSchema, ...hallTimeWindowShape })
  .refine(windowOrdered, windowRefinement);

export const hallTimeImportBodySchema = z
  .strictObject({
    rows: z.array(hallTimeInputSchema).min(1).max(400),
  })
  .refine((b) => new Set(b.rows.map((r) => r.date)).size === b.rows.length, {
    message: "rows must have distinct dates",
    path: ["rows"],
  });

export type HallTimeListQuery = z.infer<typeof hallTimeListQuerySchema>;
export type HallTimeUpsertBody = z.infer<typeof hallTimeUpsertBodySchema>;
export type HallTimeImportBody = z.infer<typeof hallTimeImportBodySchema>;
