import { db } from "../../config/database";
import { appSettings, referees, refereeGames } from "@dragons/db/schema";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type {
  HistoryDateRange,
  HistorySummaryResponse,
  HistoryLeaderboardEntry,
} from "@dragons/shared";
import type { HistoryFilterParams } from "../../routes/admin/referee-history.schemas";

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

function buildObligationPredicate() {
  return or(
    eq(refereeGames.sr1OurClub, true),
    eq(refereeGames.sr2OurClub, true),
  )!;
}

function buildActivityPredicate() {
  const ownIds = db
    .select({ id: referees.apiId })
    .from(referees)
    .where(eq(referees.isOwnClub, true));
  return or(
    sql`${refereeGames.sr1RefereeApiId} IN (${ownIds})`,
    sql`${refereeGames.sr2RefereeApiId} IN (${ownIds})`,
  )!;
}

function buildBaseWhere(
  params: HistoryFilterParams,
  resolvedFrom: string,
  resolvedTo: string,
) {
  const conds = [
    gte(refereeGames.kickoffDate, resolvedFrom),
    lte(refereeGames.kickoffDate, resolvedTo),
  ];
  conds.push(
    params.mode === "obligation"
      ? buildObligationPredicate()
      : buildActivityPredicate(),
  );
  if (params.league) conds.push(eq(refereeGames.leagueShort, params.league));
  if (params.status === "cancelled")
    conds.push(eq(refereeGames.isCancelled, true));
  else if (params.status === "forfeited")
    conds.push(eq(refereeGames.isForfeited, true));
  else if (params.status === "active") {
    conds.push(eq(refereeGames.isCancelled, false));
    conds.push(eq(refereeGames.isForfeited, false));
  }
  return and(...conds)!;
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
      filledSr1: sql<number>`sum(case when ${refereeGames.sr1OurClub}
        and ${refereeGames.sr1Status} <> 'open' then 1 else 0 end)::int`,
      filledSr2: sql<number>`sum(case when ${refereeGames.sr2OurClub}
        and ${refereeGames.sr2Status} <> 'open' then 1 else 0 end)::int`,
      unfilledSr1: sql<number>`sum(case when ${refereeGames.sr1OurClub}
        and ${refereeGames.sr1Status} = 'open' then 1 else 0 end)::int`,
      unfilledSr2: sql<number>`sum(case when ${refereeGames.sr2OurClub}
        and ${refereeGames.sr2Status} = 'open' then 1 else 0 end)::int`,
      cancelled: sql<number>`sum(case when ${refereeGames.isCancelled}
        then 1 else 0 end)::int`,
      forfeited: sql<number>`sum(case when ${refereeGames.isForfeited}
        then 1 else 0 end)::int`,
    })
    .from(refereeGames)
    .where(where);

  const kpis = params.mode === "obligation"
    ? {
        games: row?.games ?? 0,
        obligatedSlots: row?.obligatedSlots ?? 0,
        filledSlots: (row?.filledSr1 ?? 0) + (row?.filledSr2 ?? 0),
        unfilledSlots: (row?.unfilledSr1 ?? 0) + (row?.unfilledSr2 ?? 0),
        cancelled: row?.cancelled ?? 0,
        forfeited: row?.forfeited ?? 0,
        distinctReferees: 0, // filled in by leaderboard step
      }
    : {
        games: row?.games ?? 0,
        cancelled: row?.cancelled ?? 0,
        forfeited: row?.forfeited ?? 0,
        distinctReferees: 0,
      };

  const leaderboard: HistoryLeaderboardEntry[] = []; // Task 6

  return { range, kpis, leaderboard };
}
