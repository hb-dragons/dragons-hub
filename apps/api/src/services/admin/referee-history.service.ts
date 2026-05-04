import { db } from "../../config/database";
import { appSettings, referees, refereeGames } from "@dragons/db/schema";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type {
  HistoryAvailableLeague,
  HistoryDateRange,
  HistoryGameItem,
  HistorySummaryResponse,
  HistoryLeaderboardEntry,
} from "@dragons/shared";
import { escapeLikePattern } from "../utils/sql";

export type HistoryStatusValue = "played" | "cancelled" | "forfeited";

export interface HistoryFilterParams {
  dateFrom?: string;
  dateTo?: string;
  league?: string;
  status: HistoryStatusValue[];
}

export interface HistoryGamesQueryParams extends HistoryFilterParams {
  search?: string;
  limit: number;
  offset: number;
  refereeApiId?: number;
}

const REFEREE_SLOT_OPEN_STATUS = "open";

export async function resolveHistoryDateRange(
  from?: string,
  to?: string,
): Promise<HistoryDateRange> {
  if (from && to) return { from, to, source: "user" };

  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, ["currentSeasonStart", "currentSeasonEnd"]));

  const settingsFrom = rows.find((r) => r.key === "currentSeasonStart")?.value;
  const settingsTo = rows.find((r) => r.key === "currentSeasonEnd")?.value;
  if (settingsFrom && settingsTo) {
    return { from: settingsFrom, to: settingsTo, source: "settings" };
  }

  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const startYear = month >= 8 ? year : year - 1;
  return {
    from: `${startYear}-08-01`,
    to: `${startYear + 1}-07-31`,
    source: "default",
  };
}

// Matches games where our club has a slot obligation (home referee duty)
// OR where one of our own referees is actually assigned to a slot.
function buildRelevantGamesPredicate() {
  const ownIds = db
    .select({ id: referees.apiId })
    .from(referees)
    .where(eq(referees.isOwnClub, true));
  return or(
    eq(refereeGames.sr1OurClub, true),
    eq(refereeGames.sr2OurClub, true),
    sql`${refereeGames.sr1RefereeApiId} IN (${ownIds})`,
    sql`${refereeGames.sr2RefereeApiId} IN (${ownIds})`,
  )!;
}

// Shared predicate pieces used by both buildBaseWhere (the full filter) and
// buildLeagueScopeWhere (which intentionally omits the league filter).
// Ignores params.league — callers add that themselves when appropriate.
function buildBaseConds(
  params: HistoryFilterParams,
  resolvedFrom: string,
  resolvedTo: string,
) {
  const conds = [
    gte(refereeGames.kickoffDate, resolvedFrom),
    lte(refereeGames.kickoffDate, resolvedTo),
    buildRelevantGamesPredicate(),
  ];
  // Empty array = no status filter (show all).
  if (params.status.length > 0) {
    const wants = new Set(params.status);
    // "played" = not cancelled AND not forfeited.
    const statusPreds: ReturnType<typeof or>[] = [];
    if (wants.has("played")) {
      statusPreds.push(
        and(
          eq(refereeGames.isCancelled, false),
          eq(refereeGames.isForfeited, false),
        )!,
      );
    }
    if (wants.has("cancelled")) statusPreds.push(eq(refereeGames.isCancelled, true)!);
    if (wants.has("forfeited")) statusPreds.push(eq(refereeGames.isForfeited, true)!);
    conds.push(or(...statusPreds)!);
  }
  return conds;
}

function buildBaseWhere(
  params: HistoryFilterParams,
  resolvedFrom: string,
  resolvedTo: string,
) {
  const conds = buildBaseConds(params, resolvedFrom, resolvedTo);
  if (params.league) conds.push(eq(refereeGames.leagueShort, params.league));
  return and(...conds)!;
}

// Scope used for the availableLeagues list: a subset of buildBaseWhere that
// intentionally excludes the league filter, so switching leagues doesn't
// shrink the league dropdown the user picks from.
function buildLeagueScopeWhere(
  params: HistoryFilterParams,
  resolvedFrom: string,
  resolvedTo: string,
) {
  return and(...buildBaseConds(params, resolvedFrom, resolvedTo))!;
}

export async function getRefereeHistorySummary(
  params: HistoryFilterParams,
): Promise<HistorySummaryResponse> {
  const range = await resolveHistoryDateRange(params.dateFrom, params.dateTo);
  const where = buildBaseWhere(params, range.from, range.to);

  const [row] = await db
    .select({
      games: sql<number>`count(*)::int`,
      obligatedSlots: sql<number>`(
        sum(case when ${refereeGames.sr1OurClub} then 1 else 0 end)
        + sum(case when ${refereeGames.sr2OurClub} then 1 else 0 end)
      )::int`,
      // "filled" here means "any non-open status" — includes both offered and assigned
      filledSr1: sql<number>`sum(case when ${refereeGames.sr1OurClub}
        and ${refereeGames.sr1Status} <> ${REFEREE_SLOT_OPEN_STATUS} then 1 else 0 end)::int`,
      filledSr2: sql<number>`sum(case when ${refereeGames.sr2OurClub}
        and ${refereeGames.sr2Status} <> ${REFEREE_SLOT_OPEN_STATUS} then 1 else 0 end)::int`,
      unfilledSr1: sql<number>`sum(case when ${refereeGames.sr1OurClub}
        and ${refereeGames.sr1Status} = ${REFEREE_SLOT_OPEN_STATUS} then 1 else 0 end)::int`,
      unfilledSr2: sql<number>`sum(case when ${refereeGames.sr2OurClub}
        and ${refereeGames.sr2Status} = ${REFEREE_SLOT_OPEN_STATUS} then 1 else 0 end)::int`,
      cancelled: sql<number>`sum(case when ${refereeGames.isCancelled}
        then 1 else 0 end)::int`,
      forfeited: sql<number>`sum(case when ${refereeGames.isForfeited}
        then 1 else 0 end)::int`,
    })
    .from(refereeGames)
    .where(where);

  const kpis = {
    games: row?.games ?? 0,
    obligatedSlots: row?.obligatedSlots ?? 0,
    filledSlots: (row?.filledSr1 ?? 0) + (row?.filledSr2 ?? 0),
    unfilledSlots: (row?.unfilledSr1 ?? 0) + (row?.unfilledSr2 ?? 0),
    cancelled: row?.cancelled ?? 0,
    forfeited: row?.forfeited ?? 0,
    distinctReferees: 0, // filled in by leaderboard step
  };

  const leaderboard = await getRefereeHistoryLeaderboard(params, { limit: 100 });

  const finalKpis = { ...kpis, distinctReferees: leaderboard.length };

  const leagueScope = buildLeagueScopeWhere(params, range.from, range.to);
  const leagueRows = await db
    .selectDistinct({
      short: refereeGames.leagueShort,
      name: refereeGames.leagueName,
    })
    .from(refereeGames)
    .where(and(leagueScope, sql`${refereeGames.leagueShort} IS NOT NULL`)!)
    .orderBy(refereeGames.leagueShort);

  const availableLeagues: HistoryAvailableLeague[] = leagueRows
    .filter((r): r is { short: string; name: string | null } => r.short !== null)
    .map((r) => ({ short: r.short, name: r.name }));

  return { range, kpis: finalKpis, leaderboard, availableLeagues };
}

export async function getRefereeHistoryLeaderboard(
  params: HistoryFilterParams,
  options: { limit?: number } = {},
): Promise<HistoryLeaderboardEntry[]> {
  const range = await resolveHistoryDateRange(params.dateFrom, params.dateTo);
  const where = buildBaseWhere(params, range.from, range.to);
  const limit = options.limit ?? 100;

  const rows = await db.execute(sql`
    WITH appearances AS (
      SELECT ${refereeGames.sr1RefereeApiId} AS api_id,
             ${refereeGames.sr1Name} AS raw_name, 1 AS sr1, 0 AS sr2,
             ${refereeGames.kickoffDate} AS kickoff_date
      FROM ${refereeGames}
      WHERE ${where}
        AND (${refereeGames.sr1RefereeApiId} IS NOT NULL OR ${refereeGames.sr1Name} IS NOT NULL)
      UNION ALL
      SELECT ${refereeGames.sr2RefereeApiId},
             ${refereeGames.sr2Name}, 0, 1,
             ${refereeGames.kickoffDate}
      FROM ${refereeGames}
      WHERE ${where}
        AND (${refereeGames.sr2RefereeApiId} IS NOT NULL OR ${refereeGames.sr2Name} IS NOT NULL)
    )
    SELECT
      a.api_id::int AS "apiId",
      COALESCE(a.api_id::text, a.raw_name) AS group_key,
      MAX(a.raw_name) AS "rawName",
      SUM(a.sr1)::int AS "sr1Count",
      SUM(a.sr2)::int AS "sr2Count",
      (SUM(a.sr1) + SUM(a.sr2))::int AS total,
      MAX(a.kickoff_date)::text AS "lastRefereedDate",
      r.id AS "refereeId",
      r.first_name AS "firstName",
      r.last_name AS "lastName",
      COALESCE(r.is_own_club, false) AS "isOwnClub"
    FROM appearances a
    LEFT JOIN ${referees} r ON r.api_id = a.api_id
    GROUP BY group_key, a.api_id, r.id, r.first_name, r.last_name, r.is_own_club
    ORDER BY total DESC, "lastRefereedDate" DESC NULLS LAST
    LIMIT ${limit}
  `);

  return (rows.rows as Array<{
    apiId: number | null; rawName: string | null;
    refereeId: number | null; firstName: string | null; lastName: string | null;
    isOwnClub: boolean; sr1Count: number; sr2Count: number;
    total: number; lastRefereedDate: string | null;
  }>).map((r) => ({
    refereeApiId: r.apiId,
    refereeId: r.refereeId,
    displayName:
      r.lastName || r.firstName
        ? `${r.lastName ?? ""}${r.firstName ? ", " + r.firstName : ""}`.trim()
        : r.rawName ?? "",
    isOwnClub: !!r.isOwnClub,
    sr1Count: r.sr1Count,
    sr2Count: r.sr2Count,
    total: r.total,
    lastRefereedDate: r.lastRefereedDate,
  }));
}

export async function getRefereeHistoryGames(
  params: HistoryGamesQueryParams,
): Promise<{
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const range = await resolveHistoryDateRange(params.dateFrom, params.dateTo);
  const baseWhere = buildBaseWhere(params, range.from, range.to);

  const conds = [baseWhere];
  if (params.search) {
    const words = params.search.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const p = `%${escapeLikePattern(word)}%`;
      conds.push(or(
        ilike(refereeGames.homeTeamName, p),
        ilike(refereeGames.guestTeamName, p),
        ilike(refereeGames.leagueName, p),
      )!);
    }
  }
  if (params.refereeApiId !== undefined) {
    conds.push(
      or(
        eq(refereeGames.sr1RefereeApiId, params.refereeApiId),
        eq(refereeGames.sr2RefereeApiId, params.refereeApiId),
      )!,
    );
  }
  const where = and(...conds)!;

  const columns = {
    id: refereeGames.id,
    matchId: refereeGames.matchId,
    matchNo: refereeGames.matchNo,
    kickoffDate: refereeGames.kickoffDate,
    kickoffTime: refereeGames.kickoffTime,
    homeTeamName: refereeGames.homeTeamName,
    guestTeamName: refereeGames.guestTeamName,
    leagueName: refereeGames.leagueName,
    leagueShort: refereeGames.leagueShort,
    venueName: refereeGames.venueName,
    venueCity: refereeGames.venueCity,
    sr1OurClub: refereeGames.sr1OurClub,
    sr2OurClub: refereeGames.sr2OurClub,
    sr1Name: refereeGames.sr1Name,
    sr2Name: refereeGames.sr2Name,
    sr1Status: refereeGames.sr1Status,
    sr2Status: refereeGames.sr2Status,
    isCancelled: refereeGames.isCancelled,
    isForfeited: refereeGames.isForfeited,
    isHomeGame: refereeGames.isHomeGame,
  };

  const [items, countResult] = await Promise.all([
    db.select(columns).from(refereeGames).where(where)
      .orderBy(desc(refereeGames.kickoffDate), desc(refereeGames.kickoffTime))
      .limit(params.limit).offset(params.offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(refereeGames).where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return {
    items: items as HistoryGameItem[],
    total,
    limit: params.limit,
    offset: params.offset,
    hasMore: params.offset + items.length < total,
  };
}
