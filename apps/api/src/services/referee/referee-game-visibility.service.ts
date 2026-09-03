import { getDb } from "../../config/database";
import { refereeGames } from "@dragons/db/schema";
import { referees, refereeAssignmentRules } from "@dragons/db/schema";
import {
  and,
  eq,
  gte,
  lte,
  or,
  ilike,
  sql,
  asc,
  inArray,
  isNull,
  not,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { RefereeGameDetail, RefereeGameListItem } from "@dragons/shared";
import {
  refereeGameColumns,
  refereeGameBriefColumns,
  computeMySlot,
  splitRefereeGameBrief,
  toRefereeGameListItem,
} from "./referee-games.service";
import { resolveClaimableSlots } from "./referee-slot-resolver";
import { getRefereeGameContacts } from "./referee-game-contacts.service";

function buildAssignedToMe(refereeApiId: number | null) {
  if (refereeApiId == null) return null;
  return or(
    eq(refereeGames.sr1RefereeApiId, refereeApiId),
    eq(refereeGames.sr2RefereeApiId, refereeApiId),
  )!;
}

interface GetVisibleRefereeGamesParams {
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

export async function getVisibleRefereeGames(
  refereeId: number | null,
  params: GetVisibleRefereeGamesParams,
): Promise<{
  items: RefereeGameListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const { limit, offset, search, status, league, dateFrom, dateTo, gameType, assignedRefereeApiId, slotStatus } = params;

  if (refereeId === null) {
    const openOurClubSlot = or(
      and(eq(refereeGames.sr1OurClub, true), eq(refereeGames.sr1Status, "open")),
      and(eq(refereeGames.sr2OurClub, true), eq(refereeGames.sr2Status, "open")),
    )!;
    // Withdrawn games are tombstoned, never visible (issue #105).
    const conditions = [isNull(refereeGames.removedAt), openOurClubSlot];

    if (status === "cancelled") conditions.push(eq(refereeGames.isCancelled, true));
    else if (status === "forfeited") conditions.push(eq(refereeGames.isForfeited, true));
    else if (status !== "all") {
      conditions.push(eq(refereeGames.isCancelled, false));
      conditions.push(eq(refereeGames.isForfeited, false));
    }

    if (league && league.length > 0) {
      const leagueIds = league.map(Number).filter((n) => !Number.isNaN(n));
      if (leagueIds.length === 1) conditions.push(eq(refereeGames.leagueApiId, leagueIds[0]!));
      else if (leagueIds.length > 1) conditions.push(inArray(refereeGames.leagueApiId, leagueIds));
    }
    if (dateFrom) conditions.push(gte(refereeGames.kickoffDate, dateFrom));
    if (dateTo) conditions.push(lte(refereeGames.kickoffDate, dateTo));

    if (gameType === "home") conditions.push(eq(refereeGames.isHomeGame, true));
    else if (gameType === "away") conditions.push(eq(refereeGames.isGuestGame, true));

    if (assignedRefereeApiId != null) {
      conditions.push(or(
        eq(refereeGames.sr1RefereeApiId, assignedRefereeApiId),
        eq(refereeGames.sr2RefereeApiId, assignedRefereeApiId),
      )!);
    }

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

    const whereClause = and(...conditions)!;
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

  // 1. Load referee flags + federation apiId
  const [referee] = await getDb()
    .select({
      apiId: referees.apiId,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
      isOwnClub: referees.isOwnClub,
    })
    .from(referees)
    .where(eq(referees.id, refereeId));

  if (!referee) {
    return { items: [], total: 0, limit, offset, hasMore: false };
  }

  if (!referee.isOwnClub) {
    return { items: [], total: 0, limit, offset, hasMore: false };
  }

  // 2. Load referee rules
  const rules = await getDb()
    .select({
      teamId: refereeAssignmentRules.teamId,
      deny: refereeAssignmentRules.deny,
      allowSr1: refereeAssignmentRules.allowSr1,
      allowSr2: refereeAssignmentRules.allowSr2,
    })
    .from(refereeAssignmentRules)
    .where(eq(refereeAssignmentRules.refereeId, refereeId));

  // 3. Build visibility conditions
  const visibilityParts = [];

  // Base filter: at least one open our-club slot
  const openOurClubSlot = or(
    and(eq(refereeGames.sr1OurClub, true), eq(refereeGames.sr1Status, "open")),
    and(eq(refereeGames.sr2OurClub, true), eq(refereeGames.sr2Status, "open")),
  )!;

  // Home game visibility
  const homeVisibility = buildHomeVisibility(referee, rules);

  // Away game visibility
  const awayVisibility = buildAwayVisibility(referee);

  if (homeVisibility) visibilityParts.push(homeVisibility);
  if (awayVisibility) visibilityParts.push(awayVisibility);

  const visibilityCondition = visibilityParts.length === 0
    ? null
    : visibilityParts.length === 1
      ? visibilityParts[0]!
      : or(...visibilityParts)!;

  const openForMe = visibilityCondition
    ? and(openOurClubSlot, visibilityCondition)!
    : null;

  const assignedToMe = buildAssignedToMe(referee.apiId);

  const baseParts = [openForMe, assignedToMe].filter(
    (p): p is NonNullable<typeof p> => p != null,
  );

  // No visibility rules and no federation apiId → nothing to show
  if (baseParts.length === 0) {
    return { items: [], total: 0, limit, offset, hasMore: false };
  }

  const baseCondition = baseParts.length === 1
    ? baseParts[0]!
    : or(...baseParts)!;

  // 4. Standard filters
  // Withdrawn games are tombstoned, never visible (issue #105).
  const conditions = [isNull(refereeGames.removedAt), baseCondition];

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

  // Game type
  if (gameType === "home") conditions.push(eq(refereeGames.isHomeGame, true));
  else if (gameType === "away") conditions.push(eq(refereeGames.isGuestGame, true));

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

  const whereClause = and(...conditions)!;

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
    toRefereeGameListItem(row, {
      mySlot: computeMySlot(row, referee.apiId ?? null),
      claimableSlots: resolveClaimableSlots(row, referee, rules),
    }),
  );
  return {
    items: decorated,
    total, limit, offset,
    hasMore: offset + items.length < total,
  };
}

function buildHomeVisibility(
  referee: { allowAllHomeGames: boolean; allowAwayGames: boolean },
  rules: Array<{ teamId: number; deny: boolean; allowSr1: boolean; allowSr2: boolean }>,
) {
  if (referee.allowAllHomeGames) {
    // Show all home games, except those where homeTeamId is in deny list
    const denyTeamIds = rules.filter((r) => r.deny).map((r) => r.teamId);

    if (denyTeamIds.length === 0) {
      // All home games
      return eq(refereeGames.isHomeGame, true);
    }

    // Home game AND (homeTeamId is null OR homeTeamId not in deny list)
    return and(
      eq(refereeGames.isHomeGame, true),
      or(
        isNull(refereeGames.homeTeamId),
        not(inArray(refereeGames.homeTeamId, denyTeamIds)),
      ),
    );
  }

  // Allowlist mode: only show home games where homeTeamId is in allowlist
  const allowRules = rules.filter((r) => !r.deny);
  if (allowRules.length === 0) return null;

  // Build per-rule conditions: for each allow rule, the game must have
  // homeTeamId matching AND at least one open slot that the rule allows
  const ruleConditions = allowRules.map((rule) => {
    const slotConditions = [];

    if (rule.allowSr1) {
      slotConditions.push(
        and(eq(refereeGames.sr1OurClub, true), eq(refereeGames.sr1Status, "open")),
      );
    }
    if (rule.allowSr2) {
      slotConditions.push(
        and(eq(refereeGames.sr2OurClub, true), eq(refereeGames.sr2Status, "open")),
      );
    }

    // If the rule allows neither slot, it effectively hides the game
    if (slotConditions.length === 0) return null;

    const slotMatch = slotConditions.length === 1
      ? slotConditions[0]!
      : or(...slotConditions)!;

    return and(
      eq(refereeGames.homeTeamId, rule.teamId),
      slotMatch,
    );
  }).filter((c): c is NonNullable<typeof c> => c != null);

  if (ruleConditions.length === 0) return null;

  // Home game AND (matches one of the allow rules)
  return and(
    eq(refereeGames.isHomeGame, true),
    or(...ruleConditions)!,
  );
}

function buildAwayVisibility(
  referee: { allowAwayGames: boolean },
) {
  if (!referee.allowAwayGames) return null;
  return eq(refereeGames.isHomeGame, false);
}

/**
 * Fetch the one referee game matching `lookup`, if the referee may see it.
 *
 * The exported readers below differ only in which column they look the game up
 * by, and whether they return the Einsatz brief; everything else — the
 * anonymous short circuit, the own-club check, the assignment rules, the
 * visibility/assigned-to-me access condition and the row decoration — was
 * duplicated verbatim across all three.
 *
 * `refereeId === null` means "no referee scoping" (an admin-side caller), which
 * skips the access condition entirely but still honours the tombstone filter.
 *
 * It always selects the brief columns (#309) and returns the list item and the
 * brief side by side. Splitting them here rather than letting the brief columns
 * ride along on the row is what keeps `RefereeGameListItem` exactly as wide as
 * it was: `toRefereeGameListItem` spreads whatever row it is handed.
 */
async function findVisibleRefereeGame(
  refereeId: number | null,
  lookup: SQL,
): Promise<{ item: RefereeGameListItem; brief: RefereeGameDetail["brief"] } | null> {
  const columns = { ...refereeGameColumns, ...refereeGameBriefColumns };

  if (refereeId === null) {
    const [row] = await getDb()
      .select(columns)
      .from(refereeGames)
      .where(and(lookup, isNull(refereeGames.removedAt)))
      .limit(1);
    if (!row) return null;
    const { listRow, brief } = splitRefereeGameBrief(row);
    return {
      item: toRefereeGameListItem(listRow, { mySlot: null, claimableSlots: [] }),
      brief,
    };
  }

  const [referee] = await getDb()
    .select({
      apiId: referees.apiId,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
      isOwnClub: referees.isOwnClub,
    })
    .from(referees)
    .where(eq(referees.id, refereeId));

  if (!referee || !referee.isOwnClub) return null;

  const rules = await getDb()
    .select({
      teamId: refereeAssignmentRules.teamId,
      deny: refereeAssignmentRules.deny,
      allowSr1: refereeAssignmentRules.allowSr1,
      allowSr2: refereeAssignmentRules.allowSr2,
    })
    .from(refereeAssignmentRules)
    .where(eq(refereeAssignmentRules.refereeId, refereeId));

  const homeVisibility = buildHomeVisibility(referee, rules);
  const awayVisibility = buildAwayVisibility(referee);

  const visibilityParts = [homeVisibility, awayVisibility].filter(
    (p): p is NonNullable<typeof p> => p != null,
  );
  const visibilityCondition = visibilityParts.length === 0
    ? null
    : visibilityParts.length === 1
      ? visibilityParts[0]!
      : or(...visibilityParts)!;

  const assignedToMe = buildAssignedToMe(referee.apiId ?? null);

  const accessParts = [visibilityCondition, assignedToMe].filter(
    (p): p is NonNullable<typeof p> => p != null,
  );
  if (accessParts.length === 0) return null;

  const accessCondition = accessParts.length === 1
    ? accessParts[0]!
    : or(...accessParts)!;

  const [row] = await getDb()
    .select(columns)
    .from(refereeGames)
    .where(and(lookup, isNull(refereeGames.removedAt), accessCondition)!)
    .limit(1);

  if (!row) return null;
  const { listRow, brief } = splitRefereeGameBrief(row);
  return {
    item: toRefereeGameListItem(listRow, {
      mySlot: computeMySlot(row, referee.apiId ?? null),
      claimableSlots: resolveClaimableSlots(row, referee, rules),
    }),
    brief,
  };
}

/** The list item alone, for the readers that do not serve the Einsatz screen. */
async function getVisibleRefereeGame(
  refereeId: number | null,
  lookup: SQL,
): Promise<RefereeGameListItem | null> {
  const found = await findVisibleRefereeGame(refereeId, lookup);
  return found?.item ?? null;
}

/**
 * Fetch a single referee game by federation apiMatchId if it matches the referee's visibility.
 * Returns null when no referee-game exists or the referee cannot see it.
 */
export function getVisibleRefereeGameByApiMatchId(
  refereeId: number | null,
  apiMatchId: number,
): Promise<RefereeGameListItem | null> {
  return getVisibleRefereeGame(refereeId, eq(refereeGames.apiMatchId, apiMatchId));
}

/**
 * Fetch a single referee game by internal match id if it matches the referee's visibility.
 * Returns null when no referee-game exists for the match or the referee cannot see it.
 */
export function getVisibleRefereeGameByMatchId(
  refereeId: number | null,
  matchId: number,
): Promise<RefereeGameListItem | null> {
  return getVisibleRefereeGame(refereeId, eq(refereeGames.matchId, matchId));
}

/**
 * Fetch a single referee game by id if it matches the referee's visibility rules.
 * Returns null when the game does not exist or the referee cannot see it.
 *
 * This is the Einsatz screen's reader, so it carries the brief (#309) — the
 * venue address, the per-slot federation state, the change flags and the
 * federation deep link. The list and the two other single-game readers stay on
 * `RefereeGameListItem`.
 *
 * It also carries the Kampfgericht and the team contacts (#313), but only for
 * a caller who holds a slot on the game or reads it unscoped (an admin). A
 * referee browsing an open game they could claim gets neither key — and the
 * queries behind them are never run, so the data does not reach the process
 * only to be stripped on the way out.
 */
export async function getVisibleRefereeGameById(
  refereeId: number | null,
  id: number,
): Promise<RefereeGameDetail | null> {
  const found = await findVisibleRefereeGame(refereeId, eq(refereeGames.id, id));
  if (found === null) return null;

  const detail: RefereeGameDetail = { ...found.item, brief: found.brief };
  if (refereeId !== null && found.item.mySlot === null) return detail;

  const { kampfgericht, contacts } = await getRefereeGameContacts(id);
  return { ...detail, kampfgericht, contacts };
}
