import { and, eq, gte, inArray, lte, max, min, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  leagues,
  matches,
  teamEntries,
  teamStaff,
  teams,
  venueHallTimes,
} from "@dragons/db/schema";
import {
  clubWeekendDay,
  coverageFor,
  eachClubDay,
  teamDisplayName,
  timeToMinutes,
  todayInClubZone,
} from "@dragons/shared";
import type { AlternativeDatesQuery } from "@dragons/contracts";
import type {
  AlternativeDateCandidate,
  AlternativeDateFlag,
  AlternativeDateGroup,
  AlternativeDateHall,
  AlternativeDatesResponse,
  DateRange,
  HallOccupancyGame,
  HallTimeWindow,
} from "@dragons/shared";
import { getDb } from "../../config/database";
import { queryMatchWithJoins } from "../admin/match-query.service";
import { getActiveSeasonId } from "../admin/season.service";
import { findFit, programmeWindow, type BufferConfig, type PlacedGame } from "../hall-times/hall-occupancy";
import {
  getBufferConfig,
  loadHomeGameDays,
  loadOurHalls,
} from "../hall-times/hall-occupancy.service";

/**
 * A game that will actually be played. Cancelled and forfeited fixtures are
 * dead: they block no day, stretch no horizon, widen no round window, fill no
 * hall and put no coach anywhere. Every read below asks for this and nothing
 * else.
 */
function isLiveFixture() {
  return and(eq(matches.isCancelled, false), eq(matches.isForfeited, false));
}

/** The parts of the game being moved that the collision read needs. */
interface MovingGame {
  id: number;
  leagueId: number | null;
  homeTeamApiId: number;
  guestTeamApiId: number;
  homeIsOwnClub: boolean | null;
  guestIsOwnClub: boolean | null;
}

/**
 * The weekend days in a range on which neither squad of a game already plays —
 * the answer a staff member owes the other club when a game has to move.
 *
 * A fixed handful of queries, whatever the range: the game itself, the league's
 * last fixture when the client left the end open, then — in parallel — every
 * game of either squad inside the range, the round window, the game's season
 * plus the days a staff person of the moving team entry is committed elsewhere,
 * and for a home game the hall board: our halls, their hall times over the
 * range, the home games at them over the range, the buffer settings and the
 * moved game's own duration. Each is loaded once for the whole request; the
 * weekends and the halls are walked in memory, so a six-month range costs the
 * same as a two-week one.
 *
 * Returns `null` when the match does not exist, so the route can answer 404.
 */
export async function findAlternativeDates(
  matchId: number,
  params: AlternativeDatesQuery = {},
): Promise<AlternativeDatesResponse | null> {
  const [match] = await queryMatchWithJoins().where(eq(matches.id, matchId)).limit(1);
  if (!match) return null;

  const isHomeGame = match.homeIsOwnClub === true;
  const range = await resolveRange(match.leagueId, params);
  const [busyDays, roundWindow, collisions, board] = await Promise.all([
    loadBusyDays(matchId, [match.homeTeamApiId, match.guestTeamApiId], range),
    loadRoundWindow(match.leagueId, match.matchDay),
    loadCoachCollisions(match, range),
    // Only a home game asks after the halls: on an away day the venue belongs
    // to the other club and our hall times mean nothing there.
    isHomeGame ? loadHallBoard(match, range) : Promise.resolve(null),
  ]);

  const candidates: AlternativeDateCandidate[] = [];
  for (const day of eachClubDay(range.from, range.to)) {
    const weekday = clubWeekendDay(day);
    if (!weekday || busyDays.has(day)) continue;
    const flags = flagsForDay(day, roundWindow, collisions);
    if (!board) {
      candidates.push({ date: day, weekday, group: "away", halls: [], flags });
      continue;
    }
    const halls = hallsOnDay(board, day);
    candidates.push({ date: day, weekday, group: groupFor(halls), halls, flags });
  }

  return {
    isHomeGame,
    // Opponent games are known only for the leagues we sync, and no query can
    // tell the staff member what we never fetched.
    caveats: ["opponentGamesOutsideTrackedLeagues"],
    range,
    candidates: rank(candidates),
  };
}

/**
 * Which pile a home-game day belongs in, judged by the best of our halls:
 * a hall the game fits into, else a hall time held somewhere, else nothing
 * held. A closed hall is never held, and a day on which every one of our halls
 * is closed is its own pile — the city has already said no. With no halls of
 * ours at all, nothing is held either.
 */
function groupFor(halls: AlternativeDateHall[]): AlternativeDateGroup {
  if (halls.some((h) => h.fits)) return "fits";
  if (halls.some((h) => h.hallTime?.kind === "open")) return "heldNoFit";
  if (halls.length > 0 && halls.every((h) => h.hallTime?.kind === "closed")) return "closed";
  return "notHeld";
}

/** The piles in the order of how little a day still needs from the city. */
const TIER: Record<AlternativeDateGroup, number> = {
  fits: 0,
  heldNoFit: 1,
  notHeld: 2,
  closed: 3,
  away: 0,
};

function tierOf(c: AlternativeDateCandidate): number {
  return TIER[c.group];
}

/**
 * The order the panel and the copy text both use, so the mail to the other club
 * leads with the days nobody will argue about:
 *
 * 1. Days that need the least from the city come first (see `TIER`). An
 *    away game has one group and this step leaves it untouched.
 * 2. Inside a tier, unflagged days before flagged ones.
 * 3. Inside that, the list reads like a calendar.
 */
function rank(candidates: AlternativeDateCandidate[]): AlternativeDateCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      tierOf(a) - tierOf(b) ||
      Number(a.flags.length > 0) - Number(b.flags.length > 0) ||
      a.date.localeCompare(b.date),
  );
}

/**
 * What the finder has to say about a day without refusing it. Both flags
 * inform: the round window is what the federation is likely to question, the
 * collision is a coach who would have to be in two halls at once.
 */
function flagsForDay(
  day: string,
  roundWindow: DateRange | null,
  collisions: Map<string, string[]>,
): AlternativeDateFlag[] {
  const flags: AlternativeDateFlag[] = [];
  if (roundWindow && (day < roundWindow.from || day > roundWindow.to)) {
    flags.push({ type: "outsideRoundWindow" });
  }
  for (const teamEntryName of collisions.get(day) ?? []) {
    flags.push({ type: "coachCollision", teamEntryName });
  }
  return flags;
}

/**
 * The span the league actually plays this match day over — usually one weekend,
 * sometimes a fortnight. A day outside it is the one the federation may
 * question, so it is flagged rather than dropped.
 *
 * Cancelled and forfeited fixtures are dead and must not stretch the window,
 * the same rule the range horizon follows. A game with no league has no round
 * to compare against and gets no flag at all.
 *
 * The game being moved counts towards its own window: it is part of the round,
 * and a game already standing outside it is not one the finder should start
 * flagging its own current date over.
 */
async function loadRoundWindow(
  leagueId: number | null,
  matchDay: number,
): Promise<DateRange | null> {
  if (leagueId == null) return null;

  const [row] = await getDb()
    .select({ from: min(matches.kickoffDate), to: max(matches.kickoffDate) })
    .from(matches)
    .where(
      and(
        eq(matches.leagueId, leagueId),
        eq(matches.matchDay, matchDay),
        isLiveFixture(),
      ),
    );

  return row?.from != null && row.to != null ? { from: row.from, to: row.to } : null;
}

/**
 * Per day inside the range, the other team entries that play it and share a
 * staff person with the team entry being moved — a trainer cannot coach two
 * games at once, whatever the role they hold on either team (ADR 0008/0009).
 *
 * One query for the whole range once the season is known: from our squad to its
 * entry for that season, across the people on it to their other entries of the
 * same season, and on to those entries' games. Only a game neither squad of
 * which is ours — or a club with no season at all — yields nothing.
 *
 * The games themselves are matched by squad id and date alone, as the busy-day
 * read does: a squad id is stable across seasons, and a range that reaches into
 * the next one is a range the staff member chose to ask about.
 */
async function loadCoachCollisions(
  match: MovingGame,
  range: DateRange,
): Promise<Map<string, string[]>> {
  const ownSquadApiId = match.homeIsOwnClub
    ? match.homeTeamApiId
    : match.guestIsOwnClub
      ? match.guestTeamApiId
      : null;
  if (ownSquadApiId == null) return new Map();

  const seasonId = await seasonOfGame(match.leagueId);
  if (seasonId == null) return new Map();

  const movingEntry = alias(teamEntries, "moving_entry");
  const movingStaff = alias(teamStaff, "moving_staff");
  const otherStaff = alias(teamStaff, "other_staff");
  const otherEntry = alias(teamEntries, "other_entry");
  const otherTeam = alias(teams, "other_team");

  const rows = await getDb()
    .select({
      date: matches.kickoffDate,
      name: otherTeam.name,
      nameShort: otherTeam.nameShort,
      customName: otherEntry.customName,
    })
    .from(teams)
    .innerJoin(
      movingEntry,
      and(eq(movingEntry.teamId, teams.id), eq(movingEntry.seasonId, seasonId)),
    )
    .innerJoin(movingStaff, eq(movingStaff.teamEntryId, movingEntry.id))
    .innerJoin(
      otherStaff,
      and(
        eq(otherStaff.personId, movingStaff.personId),
        ne(otherStaff.teamEntryId, movingEntry.id),
      ),
    )
    .innerJoin(
      otherEntry,
      and(eq(otherEntry.id, otherStaff.teamEntryId), eq(otherEntry.seasonId, seasonId)),
    )
    .innerJoin(otherTeam, eq(otherTeam.id, otherEntry.teamId))
    .innerJoin(
      matches,
      and(
        or(
          eq(matches.homeTeamApiId, otherTeam.apiTeamPermanentId),
          eq(matches.guestTeamApiId, otherTeam.apiTeamPermanentId),
        ),
        gte(matches.kickoffDate, range.from),
        lte(matches.kickoffDate, range.to),
        ne(matches.id, match.id),
        isLiveFixture(),
      ),
    )
    .where(eq(teams.apiTeamPermanentId, ownSquadApiId));

  // Two shared people on the same other entry are one collision, and the order
  // has to be the same on every request for the list not to shuffle.
  const byDay = new Map<string, Set<string>>();
  for (const row of rows) {
    const names = byDay.get(row.date) ?? new Set<string>();
    names.add(teamDisplayName(row));
    byDay.set(row.date, names);
  }
  return new Map([...byDay].map(([day, names]) => [day, [...names].sort()]));
}

/**
 * Which season's team entries the game belongs to. The league carries it
 * (`matches.leagueId` -> `leagues.seasonRefId`, as the hall-occupancy reads do); a game
 * with no league falls back to the club's active season, so a friendly still
 * finds the people on the moving team entry. A round window has no such
 * fallback — without a league there is no round to compare against at all.
 */
async function seasonOfGame(leagueId: number | null): Promise<number | null> {
  if (leagueId == null) return getActiveSeasonId();

  const [row] = await getDb()
    .select({ seasonId: leagues.seasonRefId })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  return row?.seasonId ?? null;
}

/**
 * Whatever the client left out: today in the club's zone for the start, the
 * league's last fixture for the end. A league whose last fixture is already
 * past — or a game with no league at all — collapses the range onto today
 * rather than inventing a season end.
 *
 * Either end may still be defaulted past the other — a client asking only for
 * a `to` in the past would otherwise get today -> that day, a range that runs
 * backwards. The contract rejects such a range when the client states both
 * ends, so a defaulted end collapses onto the stated one instead.
 */
async function resolveRange(
  leagueId: number | null,
  params: AlternativeDatesQuery,
): Promise<DateRange> {
  const from = params.from ?? todayInClubZone();
  if (params.to) return { from: from > params.to ? params.to : from, to: params.to };

  const lastFixture = leagueId == null ? null : await lastLeagueFixtureDate(leagueId);
  return { from, to: lastFixture != null && lastFixture > from ? lastFixture : from };
}

/**
 * How far into the season the league still runs. Cancelled and forfeited
 * fixtures are dead and must not stretch the horizon past the last game that
 * will actually be played.
 */
async function lastLeagueFixtureDate(leagueId: number): Promise<string | null> {
  const [row] = await getDb()
    .select({ last: max(matches.kickoffDate) })
    .from(matches)
    .where(and(eq(matches.leagueId, leagueId), isLiveFixture()));
  return row?.last ?? null;
}

/**
 * Everything a home game's candidate days are judged by, loaded once for the
 * whole range: our halls, their hall times and home games keyed
 * `${venueId}:${date}`, the buffers, and how long the moved game runs.
 */
interface HallBoard {
  halls: { venueId: number; venueName: string }[];
  currentVenueId: number | null;
  hallTimes: Map<string, HallTimeWindow>;
  games: Map<string, HallOccupancyGame[]>;
  config: BufferConfig;
  durationMinutes: number;
}

async function loadHallBoard(
  match: MovingGame & { venueId: number | null },
  range: DateRange,
): Promise<HallBoard> {
  const [ourHalls, hallTimes, days, config, ownDuration] = await Promise.all([
    loadOurHalls(),
    loadHallTimesInRange(range),
    loadHomeGameDays(range),
    getBufferConfig(),
    loadOwnGameDuration(match),
  ]);

  // The moved game is not in its own way: whatever day it sits on today, the
  // hall it would leave has room for it again.
  const games = new Map<string, HallOccupancyGame[]>();
  for (const day of days) {
    games.set(
      `${day.venueId}:${day.date}`,
      day.games.filter((g) => g.matchId !== match.id),
    );
  }

  // The current hall leads when it is one of ours; the rest keep the name
  // order loadOurHalls returns them in.
  const halls = [
    ...ourHalls.filter((h) => h.venueId === match.venueId),
    ...ourHalls.filter((h) => h.venueId !== match.venueId),
  ];

  return {
    halls,
    currentVenueId: match.venueId,
    hallTimes,
    games,
    config,
    durationMinutes: ownDuration ?? config.defaultGameDurationMinutes,
  };
}

/** Each of our halls on one day, with the moved game fitted in where it goes. */
function hallsOnDay(board: HallBoard, day: string): AlternativeDateHall[] {
  return board.halls.map(({ venueId, venueName }) => {
    const key = `${venueId}:${day}`;
    const hallTime = board.hallTimes.get(key) ?? null;
    const games = board.games.get(key) ?? [];
    // The service hands each game's end rather than its duration; the
    // difference is the duration it was computed from.
    const placed: PlacedGame[] = games.map((g) => ({
      kickoffTime: g.kickoffTime,
      durationMinutes: timeToMinutes(g.endTime) - timeToMinutes(g.kickoffTime),
    }));
    const window = programmeWindow(placed, board.config);
    const coverage = window ? coverageFor(window, hallTime) : null;
    const fit = findFit({
      hallTime,
      games: placed,
      durationMinutes: board.durationMinutes,
      config: board.config,
    });
    return {
      venueId,
      venueName,
      isCurrentVenue: venueId === board.currentVenueId,
      hallTime,
      games,
      existing: coverage
        ? {
            hallTime,
            coverage: coverage.status,
            gapBeforeMinutes: coverage.gapBeforeMinutes,
            gapAfterMinutes: coverage.gapAfterMinutes,
          }
        : null,
      fits: fit.fits,
      suggestedKickoffTime: fit.suggestedKickoffTime,
    };
  });
}

/**
 * Every hall time inside the range, keyed `${venueId}:${date}`. Every venue
 * with a row is one of ours by definition, so no venue filter is needed. Times
 * come back as the sheet writes them (HH:mm), which is how every hall-time
 * screen shows them.
 */
async function loadHallTimesInRange(range: DateRange): Promise<Map<string, HallTimeWindow>> {
  const rows = await getDb()
    .select({
      venueId: venueHallTimes.venueId,
      date: venueHallTimes.date,
      kind: venueHallTimes.kind,
      startTime: venueHallTimes.startTime,
      endTime: venueHallTimes.endTime,
      note: venueHallTimes.note,
    })
    .from(venueHallTimes)
    .where(and(gte(venueHallTimes.date, range.from), lte(venueHallTimes.date, range.to)));
  return new Map(
    rows.map((r) => [
      `${r.venueId}:${r.date}`,
      {
        kind: r.kind,
        startTime: r.startTime?.slice(0, 5) ?? null,
        endTime: r.endTime?.slice(0, 5) ?? null,
        note: r.note,
      },
    ]),
  );
}

/**
 * How long the moved game runs, from the home squad's team entry of the game's
 * season (the same season the coach read uses). Null when the entry names no
 * duration, or there is no entry: the configured default applies then.
 */
async function loadOwnGameDuration(match: MovingGame): Promise<number | null> {
  const seasonId = await seasonOfGame(match.leagueId);
  if (seasonId == null) return null;

  const [row] = await getDb()
    .select({ duration: teamEntries.estimatedGameDuration })
    .from(teams)
    .innerJoin(
      teamEntries,
      and(eq(teamEntries.teamId, teams.id), eq(teamEntries.seasonId, seasonId)),
    )
    .where(eq(teams.apiTeamPermanentId, match.homeTeamApiId))
    .limit(1);
  return row?.duration ?? null;
}

/**
 * The days inside the range on which either squad is already committed.
 * Cancelled and forfeited games are dead fixtures and block nothing, and the
 * game being moved must not block its own day.
 */
async function loadBusyDays(
  matchId: number,
  squadApiIds: number[],
  range: DateRange,
): Promise<Set<string>> {
  const rows = await getDb()
    .selectDistinct({ date: matches.kickoffDate })
    .from(matches)
    .where(
      and(
        gte(matches.kickoffDate, range.from),
        lte(matches.kickoffDate, range.to),
        ne(matches.id, matchId),
        isLiveFixture(),
        or(
          inArray(matches.homeTeamApiId, squadApiIds),
          inArray(matches.guestTeamApiId, squadApiIds),
        ),
      ),
    );
  return new Set(rows.map((r) => r.date));
}
