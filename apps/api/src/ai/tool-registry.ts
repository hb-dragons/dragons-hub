import { z } from "zod";
import {
  getMatchForReschedule,
  listClubMatches,
  listVenueBookings,
  listClubVenues,
  getRoundWindow,
  getRefereeContext,
} from "../services/reschedule/reschedule-context.service";
import { verifySlot } from "../services/reschedule/verify-slot.service";
import {
  verifySlotInputSchema,
  dateRangeSchema,
  listVenueBookingsSchema,
  matchIdSchema,
  roundWindowSchema,
} from "../services/reschedule/reschedule.types";

export interface ReschedTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  execute: (input: unknown) => Promise<unknown>;
}

function tool<S extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  inputSchema: S,
  run: (i: z.infer<S>) => Promise<unknown>,
): ReschedTool {
  return { name, description, inputSchema, execute: (raw) => run(inputSchema.parse(raw) as z.infer<S>) };
}

export const reschedTools: ReschedTool[] = [
  tool(
    "get_match",
    "Load the game being rescheduled: teams, current date/time/venue, league and matchday.",
    matchIdSchema,
    (i) => getMatchForReschedule(i.matchId),
  ),
  tool(
    "list_club_matches",
    "List own-club games (active only) between two dates (YYYY-MM-DD) to spot clashes.",
    dateRangeSchema,
    (i) => listClubMatches(i),
  ),
  tool(
    "list_venue_bookings",
    "List hall bookings between two dates, optionally for one venue, with their time windows and status.",
    listVenueBookingsSchema,
    (i) => listVenueBookings(i),
  ),
  tool(
    "list_club_venues",
    "List the club's venues (halls) the game could be moved to.",
    z.object({}),
    () => listClubVenues(),
  ),
  tool(
    "get_round_window",
    "The allowed date range (min/max kickoff) for a league + matchday, from synced matches; the federation will reject dates outside it.",
    roundWindowSchema,
    (i) => getRoundWindow(i),
  ),
  tool(
    "get_referee_context",
    "Current referees assigned to a game and a caveat that availability for a new date must be confirmed after the portal move.",
    matchIdSchema,
    (i) => getRefereeContext(i.matchId),
  ),
  tool(
    "verify_slot",
    "Deterministically check a proposed (date, time, venue) for physical conflicts: venue busy, team double-booked, outside the round window. Returns { ok, conflicts }. ALWAYS call this before presenting a slot; never present a slot whose result is not ok.",
    verifySlotInputSchema,
    (i) => verifySlot(i),
  ),
];
