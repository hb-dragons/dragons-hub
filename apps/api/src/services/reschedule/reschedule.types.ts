import { z } from "zod";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const TIME = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "time must be HH:MM or HH:MM:SS")
  .transform((t) => (t.length === 5 ? `${t}:00` : t));

export const verifySlotInputSchema = z.object({
  matchId: z.number().int().positive(),
  date: DATE,
  time: TIME,
  venueId: z.number().int().positive(),
});
export type VerifySlotInput = z.infer<typeof verifySlotInputSchema>;

export type ConflictType =
  | "venue-busy"
  | "team-double-book"
  | "outside-round-window"
  | "round-window-unknown"
  | "match-not-found"
  | "venue-not-found";

export interface SlotConflict {
  type: ConflictType;
  detail: string;
  severity: "blocking" | "warning";
}

export interface VerifySlotResult {
  ok: boolean; // true when there is no blocking conflict
  conflicts: SlotConflict[];
}

export const dateRangeSchema = z.object({ from: DATE, to: DATE });
export const listVenueBookingsSchema = z.object({
  from: DATE,
  to: DATE,
  venueId: z.number().int().positive().optional(),
});
export const matchIdSchema = z.object({ matchId: z.number().int().positive() });
export const roundWindowSchema = z.object({
  leagueId: z.number().int().positive(),
  matchDay: z.number().int().nonnegative(),
});
