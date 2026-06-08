import { z } from "zod";

export const broadcastUpsertSchema = z.object({
  deviceId: z.string().min(1),
  matchId: z.number().int().positive().nullable().optional(),
  homeAbbr: z.string().max(8).nullable().optional(),
  guestAbbr: z.string().max(8).nullable().optional(),
  homeColorOverride: z.string().max(20).nullable().optional(),
  guestColorOverride: z.string().max(20).nullable().optional(),
});

export const broadcastStartStopSchema = z.object({ deviceId: z.string().min(1) });

export const broadcastMatchesQuerySchema = z.object({
  q: z.string().optional(),
  scope: z.enum(["today", "all"]).default("today"),
});

export type BroadcastUpsertBody = z.infer<typeof broadcastUpsertSchema>;
export type BroadcastStartStopBody = z.infer<typeof broadcastStartStopSchema>;
