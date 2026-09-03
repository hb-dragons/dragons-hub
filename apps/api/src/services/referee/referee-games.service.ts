import { getDb } from "../../config/database";
import { refereeGames } from "@dragons/db/schema";
import { and, eq, gte, isNull, lte, or, ilike, sql, asc, inArray } from "drizzle-orm";
import type { RefereeGameBrief, RefereeGameListItem } from "@dragons/shared";
import { federationGameUrl } from "@dragons/shared";

const isTrackedLeagueExpr = sql<boolean>`${refereeGames.matchId} IS NOT NULL`.as("is_tracked_league");

const refereeGameColumns = {
  id: refereeGames.id,
  apiMatchId: refereeGames.apiMatchId,
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
  homeTeamId: refereeGames.homeTeamId,
  sr1OurClub: refereeGames.sr1OurClub,
  sr2OurClub: refereeGames.sr2OurClub,
  sr1Name: refereeGames.sr1Name,
  sr2Name: refereeGames.sr2Name,
  sr1RefereeApiId: refereeGames.sr1RefereeApiId,
  sr2RefereeApiId: refereeGames.sr2RefereeApiId,
  sr1Status: refereeGames.sr1Status,
  sr2Status: refereeGames.sr2Status,
  isCancelled: refereeGames.isCancelled,
  isForfeited: refereeGames.isForfeited,
  lastSyncedAt: refereeGames.lastSyncedAt,
  isTrackedLeague: isTrackedLeagueExpr,
  isHomeGame: refereeGames.isHomeGame,
  isGuestGame: refereeGames.isGuestGame,
} as const;

export { refereeGameColumns };

/**
 * The columns behind the Einsatz brief (#309), selected only by the readers
 * that build a `RefereeGameDetail`. They are deliberately not part of
 * `refereeGameColumns`: the list endpoint's shape is unchanged, and a referee
 * scanning a list of games does not need the hall's street.
 *
 * `apiMatchId` is not repeated here — it is already in `refereeGameColumns`, and
 * `toRefereeGameBrief` reads it off the same row to build the federation link.
 */
const refereeGameBriefColumns = {
  venueStreet: refereeGames.venueStreet,
  venuePostalCode: refereeGames.venuePostalCode,
  sr1Tentative: refereeGames.sr1Tentative,
  sr2Tentative: refereeGames.sr2Tentative,
  venueChanged: refereeGames.venueChanged,
  timeChanged: refereeGames.timeChanged,
} as const;

export { refereeGameBriefColumns };

/** What `toRefereeGameBrief` needs off a row selected with both column sets. */
interface RefereeGameBriefRow {
  apiMatchId: number;
  venueStreet: string | null;
  venuePostalCode: string | null;
  sr1Tentative: boolean;
  sr2Tentative: boolean;
  venueChanged: boolean;
  timeChanged: boolean;
}

/**
 * Build the brief from a row selected with both column sets.
 *
 * Rows synced before the columns existed carry `null` street and postal code,
 * and the screen drops the address line rather than rendering blanks — so the
 * nulls travel to the client as nulls instead of being papered over here.
 */
function toRefereeGameBrief(row: RefereeGameBriefRow): RefereeGameBrief {
  return {
    venueStreet: row.venueStreet,
    venuePostalCode: row.venuePostalCode,
    sr1Tentative: row.sr1Tentative,
    sr2Tentative: row.sr2Tentative,
    venueChanged: row.venueChanged,
    timeChanged: row.timeChanged,
    federationUrl: federationGameUrl(row.apiMatchId),
  };
}

/**
 * A row as `refereeGameColumns` selects it, before decoration.
 *
 * It differs from the wire shape in exactly one place: `last_synced_at` is a
 * `timestamp` column, so drizzle hands back a `Date`, while
 * `RefereeGameListItem` — the type web and native read the JSON response
 * through — promises the ISO string.
 */
type RefereeGameRow = Omit<RefereeGameListItem, "mySlot" | "claimableSlots" | "lastSyncedAt"> & {
  lastSyncedAt: Date | null;
};

/**
 * Turn a selected row into the response item.
 *
 * Every referee-game reader funnels its rows through here so the `Date` →
 * ISO-string conversion happens once. Relying on `JSON.stringify` to paper
 * over the difference worked only because `Date.toJSON()` happens to produce
 * the same text; anything that read `lastSyncedAt` before serialization got a
 * `Date` while the type said `string`.
 */
export function toRefereeGameListItem(
  row: RefereeGameRow,
  decoration: Pick<RefereeGameListItem, "mySlot" | "claimableSlots">,
): RefereeGameListItem {
  return {
    ...row,
    ...decoration,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  };
}

/** The columns `refereeGameBriefColumns` adds on top of `refereeGameColumns`. */
type BriefOnlyColumn = keyof typeof refereeGameBriefColumns;

/**
 * Take a row selected with both column sets apart: the brief-only columns come
 * off into a built `RefereeGameBrief`, and what is left is the list-item row.
 *
 * Those columns have to come off before the row reaches
 * `toRefereeGameListItem`, which spreads whatever it is handed — leave them on
 * and `RefereeGameListItem` silently grows six fields it does not declare, on
 * the one endpoint that is supposed to keep its list shape.
 */
export function splitRefereeGameBrief<T extends RefereeGameBriefRow>(
  row: T,
): { listRow: Omit<T, BriefOnlyColumn>; brief: RefereeGameBrief } {
  const {
    venueStreet: _venueStreet,
    venuePostalCode: _venuePostalCode,
    sr1Tentative: _sr1Tentative,
    sr2Tentative: _sr2Tentative,
    venueChanged: _venueChanged,
    timeChanged: _timeChanged,
    ...listRow
  } = row;
  return { listRow, brief: toRefereeGameBrief(row) };
}

/**
 * Compute which slot (1, 2) the given referee apiId is assigned to, or null.
 * Pass `null` apiId for admin views — always returns null.
 */
export function computeMySlot(
  row: Pick<RefereeGameListItem, "sr1RefereeApiId" | "sr2RefereeApiId">,
  refereeApiId: number | null,
): 1 | 2 | null {
  if (refereeApiId == null) return null;
  if (row.sr1RefereeApiId === refereeApiId) return 1;
  if (row.sr2RefereeApiId === refereeApiId) return 2;
  return null;
}

export async function getRefereeGameById(id: number): Promise<RefereeGameListItem | null> {
  const [row] = await getDb()
    .select(refereeGameColumns)
    .from(refereeGames)
    // Tombstoned games (issue #105) are withdrawn fixtures, not live ones.
    .where(and(eq(refereeGames.id, id), isNull(refereeGames.removedAt)))
    .limit(1);
  if (!row) return null;
  return toRefereeGameListItem(row, { mySlot: null, claimableSlots: [] });
}

interface GetRefereeGamesParams {
  limit: number;
  offset: number;
  search?: string;
  status?: "active" | "cancelled" | "forfeited" | "all";
  league?: string[];
  dateFrom?: string;
  dateTo?: string;
  gameType?: "home" | "away" | "both";
  assignedRefereeApiId?: number;
  slotStatus?: "open" | "offered" | "any";
}

export async function getRefereeGames(params: GetRefereeGamesParams) {
  const { limit, offset, search, status, league, dateFrom, dateTo, gameType, assignedRefereeApiId, slotStatus } = params;
  // Games withdrawn from the federation schedule are tombstoned, never listed (issue #105).
  const conditions = [isNull(refereeGames.removedAt)];

  // Status
  if (status === "cancelled") conditions.push(eq(refereeGames.isCancelled, true));
  else if (status === "forfeited") conditions.push(eq(refereeGames.isForfeited, true));
  else if (status !== "all") {
    conditions.push(eq(refereeGames.isCancelled, false));
    conditions.push(eq(refereeGames.isForfeited, false));
  }

  // League
  if (league && league.length > 0) {
    const leagueIds = league.map(Number).filter((n) => !Number.isNaN(n));
    if (leagueIds.length === 1) conditions.push(eq(refereeGames.leagueApiId, leagueIds[0]!));
    else if (leagueIds.length > 1) conditions.push(inArray(refereeGames.leagueApiId, leagueIds));
  }

  // Game type
  if (gameType === "home") conditions.push(eq(refereeGames.isHomeGame, true));
  else if (gameType === "away") conditions.push(eq(refereeGames.isGuestGame, true));
  // "both" or undefined: no filter

  // Date range
  if (dateFrom) conditions.push(gte(refereeGames.kickoffDate, dateFrom));
  if (dateTo) conditions.push(lte(refereeGames.kickoffDate, dateTo));

  // Search
  if (search) {
    const words = search.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const pattern = `%${word}%`;
      conditions.push(or(
        ilike(refereeGames.homeTeamName, pattern),
        ilike(refereeGames.guestTeamName, pattern),
        ilike(refereeGames.leagueName, pattern),
      )!);
    }
  }

  // Assigned referee
  if (assignedRefereeApiId != null) {
    conditions.push(or(
      eq(refereeGames.sr1RefereeApiId, assignedRefereeApiId),
      eq(refereeGames.sr2RefereeApiId, assignedRefereeApiId),
    )!);
  }

  // Slot status
  if (slotStatus === "open") {
    conditions.push(
      or(eq(refereeGames.sr1Status, "open"), eq(refereeGames.sr2Status, "open"))!,
    );
  } else if (slotStatus === "offered") {
    conditions.push(
      or(
        eq(refereeGames.sr1Status, "open"),
        eq(refereeGames.sr2Status, "open"),
        eq(refereeGames.sr1Status, "offered"),
        eq(refereeGames.sr2Status, "offered"),
      )!,
    );
  }
  // slotStatus === "any" or undefined: no extra clause

  const whereClause = conditions.length > 0
    ? conditions.length === 1 ? conditions[0]! : and(...conditions)!
    : undefined;

  const [items, countResult] = await Promise.all([
    getDb().select(refereeGameColumns)
    .from(refereeGames)
    .where(whereClause)
    .orderBy(asc(refereeGames.kickoffDate), asc(refereeGames.kickoffTime))
    .limit(limit)
    .offset(offset),
    getDb().select({ count: sql<number>`count(*)::int` })
    .from(refereeGames)
    .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  const decorated: RefereeGameListItem[] = items.map((row) =>
    toRefereeGameListItem(row, { mySlot: null, claimableSlots: [] }),
  );
  return {
    items: decorated,
    total, limit, offset,
    hasMore: offset + items.length < total,
  };
}
