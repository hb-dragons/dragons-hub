import { db } from "../../config/database";
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
import type { RefereeGameListItem } from "@dragons/shared";
import { refereeGameColumns, computeMySlot } from "./referee-games.service";

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
  league?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getVisibleRefereeGames(
  refereeId: number,
  params: GetVisibleRefereeGamesParams,
): Promise<{
  items: RefereeGameListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const { limit, offset, search, status, league, dateFrom, dateTo } = params;

  // 1. Load referee flags + federation apiId
  const [referee] = await db
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
  const rules = await db
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
  const conditions = [baseCondition];

  // Status
  if (status === "cancelled") conditions.push(eq(refereeGames.isCancelled, true));
  else if (status === "forfeited") conditions.push(eq(refereeGames.isForfeited, true));
  else if (status !== "all") {
    conditions.push(eq(refereeGames.isCancelled, false));
    conditions.push(eq(refereeGames.isForfeited, false));
  }

  // League
  if (league) conditions.push(eq(refereeGames.leagueShort, league));

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

  const whereClause = and(...conditions)!;

  const [items, countResult] = await Promise.all([
    db.select(refereeGameColumns)
    .from(refereeGames)
    .where(whereClause)
    .orderBy(asc(refereeGames.kickoffDate), asc(refereeGames.kickoffTime))
    .limit(limit)
    .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
    .from(refereeGames)
    .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  const decorated = items.map((row) => ({
    ...row,
    mySlot: computeMySlot(row, referee.apiId ?? null),
  })) as RefereeGameListItem[];
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
  referee: { allowAllHomeGames: boolean; allowAwayGames: boolean },
) {
  if (!referee.allowAwayGames) return null;
  return eq(refereeGames.isHomeGame, false);
}

/**
 * Fetch a single referee game by id if it matches the referee's visibility rules.
 * Returns null when the game does not exist or the referee cannot see it.
 */
export async function getVisibleRefereeGameById(
  refereeId: number,
  id: number,
): Promise<RefereeGameListItem | null> {
  const [referee] = await db
    .select({
      apiId: referees.apiId,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
      isOwnClub: referees.isOwnClub,
    })
    .from(referees)
    .where(eq(referees.id, refereeId));

  if (!referee || !referee.isOwnClub) return null;

  const rules = await db
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

  const [row] = await db
    .select(refereeGameColumns)
    .from(refereeGames)
    .where(and(eq(refereeGames.id, id), accessCondition)!)
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    mySlot: computeMySlot(row, referee.apiId ?? null),
  } as RefereeGameListItem;
}
