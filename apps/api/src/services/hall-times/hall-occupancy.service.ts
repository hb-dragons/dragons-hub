import { and, asc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { leagues, matches, teamEntries, teams, venueHallTimes, venues } from "@dragons/db/schema";
import {
  BOOKING_DEFAULTS,
  clubDayAnchor,
  coverageFor,
  plusDaysInClubZone,
  todayInClubZone,
} from "@dragons/shared";
import type { HallOccupancyDay, HallOccupancyGame } from "@dragons/shared";
import type { HallOccupancyQuery } from "@dragons/contracts";
import { getDb } from "../../config/database";
import { readIntSetting, readSettings } from "../settings/app-settings.reader";
import { getActiveSeason } from "../admin/season.service";
import { loadHallTimesByDay } from "./hall-time.service";
import { gameEnd, programmeWindow, type BufferConfig } from "./hall-occupancy";

// ── Config ───────────────────────────────────────────────────────────────────

const SETTING_KEYS = {
  bufferBefore: "venue_booking_buffer_before",
  bufferAfter: "venue_booking_buffer_after",
  gameDuration: "venue_booking_game_duration",
} as const;

/**
 * The programme-window settings every hall-occupancy read applies. The keys
 * keep their `venue_booking_` prefix from the stored-booking era; the admin
 * settings route writes the same keys.
 */
export async function getBufferConfig(): Promise<BufferConfig> {
  const settings = await readSettings([
    SETTING_KEYS.bufferBefore,
    SETTING_KEYS.bufferAfter,
    SETTING_KEYS.gameDuration,
  ]);
  return {
    bufferBeforeMinutes: readIntSetting(settings, SETTING_KEYS.bufferBefore, BOOKING_DEFAULTS.bufferBefore),
    bufferAfterMinutes: readIntSetting(settings, SETTING_KEYS.bufferAfter, BOOKING_DEFAULTS.bufferAfter),
    defaultGameDurationMinutes: readIntSetting(settings, SETTING_KEYS.gameDuration, BOOKING_DEFAULTS.gameDuration),
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Our halls: every venue the club holds at least one hall-time row for. */
export async function loadOurHalls(): Promise<{ venueId: number; venueName: string }[]> {
  const rows = await getDb()
    .selectDistinct({ venueId: venues.id, venueName: venues.name })
    .from(venueHallTimes)
    .innerJoin(venues, eq(venues.id, venueHallTimes.venueId))
    .orderBy(asc(venues.name), asc(venues.id));
  return rows;
}

type GameScope =
  | { from: string; to: string; venueIds?: number[] }
  | { matchIds: number[] };

interface GameRow extends Omit<HallOccupancyGame, "endTime"> {
  venueId: number;
  venueName: string;
  date: string;
  durationMinutes: number | null;
}

/** Live home games at our halls that match `condition`. */
async function queryGameRows(condition: SQL | undefined): Promise<GameRow[]> {
  const homeTeam = alias(teams, "home_team");
  const guestTeam = alias(teams, "guest_team");
  const homeEntry = alias(teamEntries, "home_entry");

  return getDb()
    .select({
      matchId: matches.id,
      venueId: venues.id,
      venueName: venues.name,
      date: matches.kickoffDate,
      kickoffTime: matches.kickoffTime,
      homeTeam: homeTeam.name,
      homeTeamCustomName: homeEntry.customName,
      homeBadgeColor: homeEntry.badgeColor,
      guestTeam: guestTeam.name,
      leagueName: leagues.name,
      durationMinutes: homeEntry.estimatedGameDuration,
    })
    .from(matches)
    .innerJoin(venues, eq(venues.id, matches.venueId))
    .innerJoin(homeTeam, eq(homeTeam.apiTeamPermanentId, matches.homeTeamApiId))
    .innerJoin(guestTeam, eq(guestTeam.apiTeamPermanentId, matches.guestTeamApiId))
    .leftJoin(leagues, eq(leagues.id, matches.leagueId))
    .leftJoin(
      homeEntry,
      and(eq(homeEntry.teamId, homeTeam.id), eq(homeEntry.seasonId, leagues.seasonRefId)),
    )
    .where(
      and(
        eq(homeTeam.isOwnClub, true),
        eq(matches.isCancelled, false),
        eq(matches.isForfeited, false),
        sql`exists (select 1 from ${venueHallTimes} where ${venueHallTimes.venueId} = ${matches.venueId})`,
        condition,
      ),
    )
    .orderBy(asc(matches.kickoffTime), asc(matches.id));
}

/** The (venue, day) pairs the given matches sit on. */
async function pairsOfMatches(matchIds: number[]): Promise<{ venueId: number; date: string }[]> {
  const rows = await queryGameRows(inArray(matches.id, matchIds));
  const unique = new Map(rows.map((r) => [`${r.venueId}:${r.date}`, { venueId: r.venueId, date: r.date }]));
  return [...unique.values()];
}

/**
 * Live home games at our halls, grouped by venue and day: games in kickoff
 * order, the hall window they need, and how the day's hall time covers it.
 * A `matchIds` scope returns the full days those games sit on.
 */
export async function loadHomeGameDays(scope: GameScope): Promise<HallOccupancyDay[]> {
  let condition: SQL | undefined;
  if ("matchIds" in scope) {
    if (scope.matchIds.length === 0) return [];
    const pairs = await pairsOfMatches(scope.matchIds);
    if (pairs.length === 0) return [];
    condition = or(
      ...pairs.map((p) => and(eq(matches.venueId, p.venueId), eq(matches.kickoffDate, p.date))),
    );
  } else {
    if (scope.venueIds && scope.venueIds.length === 0) return [];
    condition = and(
      gte(matches.kickoffDate, scope.from),
      lte(matches.kickoffDate, scope.to),
      scope.venueIds ? inArray(matches.venueId, scope.venueIds) : undefined,
    );
  }

  const rows = await queryGameRows(condition);
  if (rows.length === 0) return [];

  const config = await getBufferConfig();
  const groups = new Map<string, GameRow[]>();
  for (const row of rows) {
    const key = `${row.venueId}:${row.date}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const hallTimes = await loadHallTimesByDay(
    [...groups.values()].map((g) => ({ venueId: g[0]!.venueId, date: g[0]!.date })),
  );

  const days: HallOccupancyDay[] = [];
  for (const [key, group] of groups) {
    const first = group[0]!;
    const window = programmeWindow(group, config)!;
    const row = hallTimes.get(key) ?? null;
    const hallTime = row
      ? { kind: row.kind, startTime: row.startTime, endTime: row.endTime, note: row.note }
      : null;
    const coverage = coverageFor(window, hallTime);
    days.push({
      venueId: first.venueId,
      venueName: first.venueName,
      date: first.date,
      windowStart: window.start,
      windowEnd: window.end,
      hallTime,
      coverage: coverage.status,
      gapBeforeMinutes: coverage.gapBeforeMinutes,
      gapAfterMinutes: coverage.gapAfterMinutes,
      games: group.map((g) => ({
        matchId: g.matchId,
        kickoffTime: g.kickoffTime,
        endTime: gameEnd(g, config),
        homeTeam: g.homeTeam,
        homeTeamCustomName: g.homeTeamCustomName,
        homeBadgeColor: g.homeBadgeColor,
        guestTeam: g.guestTeam,
        leagueName: g.leagueName,
      })),
    });
  }

  return days.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.venueName.localeCompare(b.venueName) ||
      a.venueId - b.venueId,
  );
}

/** Days with home games at our halls, defaulting to today through the end of the active season. */
export async function listHallOccupancy(query: HallOccupancyQuery): Promise<HallOccupancyDay[]> {
  const from = query.dateFrom ?? todayInClubZone();
  const seasonEnd = query.dateTo ? null : (await getActiveSeason())?.endDate ?? null;
  // A season that is already over would invert the range, so it counts as no end.
  const to =
    query.dateTo ??
    (seasonEnd && seasonEnd >= from ? seasonEnd : plusDaysInClubZone(365, clubDayAnchor(from)));

  const days = await loadHomeGameDays({
    from,
    to,
    venueIds: query.venueId ? [query.venueId] : undefined,
  });
  return query.coverage ? days.filter((d) => d.coverage === query.coverage) : days;
}
