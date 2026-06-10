import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "../../config/database";
import { matches, teams, venues, venueBookings, venueBookingMatches } from "@dragons/db/schema";
import { calculateTimeWindow } from "../venue-booking/booking-calculator";
import { getBookingConfig } from "../venue-booking/venue-booking.service";
import type { SlotConflict, VerifySlotInput, VerifySlotResult } from "./reschedule.types";
import { verifySlotInputSchema } from "./reschedule.types";

function windowsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function verifySlot(rawInput: VerifySlotInput): Promise<VerifySlotResult> {
  const input = verifySlotInputSchema.parse(rawInput);
  const conflicts: SlotConflict[] = [];

  const [match] = await db
    .select({
      id: matches.id,
      homeTeamApiId: matches.homeTeamApiId,
      guestTeamApiId: matches.guestTeamApiId,
      leagueId: matches.leagueId,
      matchDay: matches.matchDay,
    })
    .from(matches)
    .where(eq(matches.id, input.matchId))
    .limit(1);

  if (!match) {
    return {
      ok: false,
      conflicts: [{ type: "match-not-found", detail: `No match with id ${input.matchId}`, severity: "blocking" }],
    };
  }

  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.id, input.venueId))
    .limit(1);

  if (!venue) {
    conflicts.push({ type: "venue-not-found", detail: `No venue with id ${input.venueId}`, severity: "blocking" });
  }

  if (venue) {
    const config = await getBookingConfig();
    const [homeTeam] = await db
      .select({ duration: teams.estimatedGameDuration })
      .from(teams)
      .where(eq(teams.apiTeamPermanentId, match.homeTeamApiId))
      .limit(1);

    // calculateTimeWindow always returns a window for a single-element input array
    const proposed = calculateTimeWindow(
      [{ kickoffTime: input.time, teamGameDuration: homeTeam?.duration ?? null }],
      config,
    )!;

    const bookingsThatDay = await db
      .select({
        id: venueBookings.id,
        calcStart: venueBookings.calculatedStartTime,
        calcEnd: venueBookings.calculatedEndTime,
        ovrStart: venueBookings.overrideStartTime,
        ovrEnd: venueBookings.overrideEndTime,
      })
      .from(venueBookings)
      .where(and(eq(venueBookings.venueId, input.venueId), eq(venueBookings.date, input.date)));

    for (const b of bookingsThatDay) {
      const linked = await db
        .select({ matchId: venueBookingMatches.matchId })
        .from(venueBookingMatches)
        .where(eq(venueBookingMatches.venueBookingId, b.id));

      const onlyThisMatch = linked.length > 0 && linked.every((l) => l.matchId === input.matchId);
      if (onlyThisMatch) continue;

      const bStart = b.ovrStart ?? b.calcStart;
      const bEnd = b.ovrEnd ?? b.calcEnd;

      if (
        bStart &&
        bEnd &&
        windowsOverlap(proposed.calculatedStartTime, proposed.calculatedEndTime, bStart, bEnd)
      ) {
        conflicts.push({
          type: "venue-busy",
          detail: `Venue already booked ${bStart}-${bEnd} on ${input.date}; proposed ${proposed.calculatedStartTime}-${proposed.calculatedEndTime}`,
          severity: "blocking",
        });
        break;
      }
    }
  }

  const teamApiIds = [match.homeTeamApiId, match.guestTeamApiId];
  const sameDay = await db
    .select({ id: matches.id, isCancelled: matches.isCancelled, isForfeited: matches.isForfeited })
    .from(matches)
    .where(
      and(
        eq(matches.kickoffDate, input.date),
        ne(matches.id, input.matchId),
        or(inArray(matches.homeTeamApiId, teamApiIds), inArray(matches.guestTeamApiId, teamApiIds)),
      ),
    );

  const activeClash = sameDay.find((mm) => mm.isCancelled !== true && mm.isForfeited !== true);
  if (activeClash) {
    conflicts.push({
      type: "team-double-book",
      detail: `One of the teams already has match ${activeClash.id} on ${input.date}`,
      severity: "blocking",
    });
  }

  if (match.leagueId == null) {
    conflicts.push({
      type: "round-window-unknown",
      detail: "Match has no league; round window cannot be derived",
      severity: "warning",
    });
  } else {
    const roundMatches = await db
      .select({ date: matches.kickoffDate })
      .from(matches)
      .where(and(eq(matches.leagueId, match.leagueId), eq(matches.matchDay, match.matchDay)));

    const dates = roundMatches.map((r) => r.date).filter((d): d is string => !!d).sort();
    // The match being verified is itself in this league+matchday, so dates will always have at least one entry.
    const min = dates[0]!;
    const max = dates[dates.length - 1]!;

    if (input.date < min || input.date > max) {
      conflicts.push({
        type: "outside-round-window",
        detail: `Date ${input.date} is outside the matchday window ${min}..${max}`,
        severity: "blocking",
      });
    }
  }

  return { ok: conflicts.every((c) => c.severity !== "blocking"), conflicts };
}
