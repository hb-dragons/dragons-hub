import { getDb } from "../../config/database";
import { referees, refereeAssignmentRules, teams, matchReferees } from "@dragons/db/schema";
import { sql, asc, desc, ilike, and, or, eq, inArray } from "drizzle-orm";
import type {
  RefereeListItem,
  PaginatedResponse,
  UpdateRefereeVisibilityBody,
  UpdateRefereeRulesBody,
  RefereeCountsResponse,
} from "@dragons/shared";

export class RefereeSettingsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "NOT_OWN_CLUB"
      | "VALIDATION_ERROR",
  ) {
    super(message);
    this.name = "RefereeSettingsError";
  }
}

type RefereeScope = "own" | "all";
type RefereeSort = "name" | "workloadAsc" | "workloadDesc";

export interface RefereeListParams {
  limit: number;
  offset: number;
  search?: string;
  scope: RefereeScope;
  sort?: RefereeSort;
}

export async function getReferees(
  params: RefereeListParams,
): Promise<PaginatedResponse<RefereeListItem>> {
  const { limit, offset, search, scope, sort = "name" } = params;

  const conditions = [];
  if (scope === "own") conditions.push(eq(referees.isOwnClub, true));
  if (search) {
    conditions.push(
      or(
        ilike(referees.firstName, `%${search}%`),
        ilike(referees.lastName, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const matchCountExpr = sql<number>`count(distinct ${matchReferees.matchId})::int`.as("match_count");

  const orderBy =
    sort === "workloadDesc" ? [desc(matchCountExpr), asc(referees.lastName)] :
    sort === "workloadAsc"  ? [asc(matchCountExpr),  asc(referees.lastName)] :
                              [asc(referees.lastName), asc(referees.firstName)];

  const [rows, countResult] = await Promise.all([
    getDb()
      .select({
        id: referees.id,
        apiId: referees.apiId,
        firstName: referees.firstName,
        lastName: referees.lastName,
        licenseNumber: referees.licenseNumber,
        allowAllHomeGames: referees.allowAllHomeGames,
        allowAwayGames: referees.allowAwayGames,
        isOwnClub: referees.isOwnClub,
        matchCount: matchCountExpr,
        createdAt: referees.createdAt,
        updatedAt: referees.updatedAt,
      })
      .from(referees)
      .leftJoin(matchReferees, eq(matchReferees.refereeId, referees.id))
      .where(whereClause)
      .groupBy(referees.id)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(referees)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const items: RefereeListItem[] = rows.map((row) => ({
    id: row.id,
    apiId: row.apiId,
    firstName: row.firstName,
    lastName: row.lastName,
    licenseNumber: row.licenseNumber,
    allowAllHomeGames: row.allowAllHomeGames,
    allowAwayGames: row.allowAwayGames,
    isOwnClub: row.isOwnClub,
    matchCount: row.matchCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return { items, total, limit, offset, hasMore: offset + items.length < total };
}

export async function getRefereeById(refereeId: number): Promise<RefereeListItem | null> {
  const matchCountExpr = sql<number>`count(distinct ${matchReferees.matchId})::int`.as("match_count");

  const [row] = await getDb()
    .select({
      id: referees.id,
      apiId: referees.apiId,
      firstName: referees.firstName,
      lastName: referees.lastName,
      licenseNumber: referees.licenseNumber,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
      isOwnClub: referees.isOwnClub,
      matchCount: matchCountExpr,
      createdAt: referees.createdAt,
      updatedAt: referees.updatedAt,
    })
    .from(referees)
    .leftJoin(matchReferees, eq(matchReferees.refereeId, referees.id))
    .where(eq(referees.id, refereeId))
    .groupBy(referees.id);

  if (!row) return null;
  return {
    id: row.id,
    apiId: row.apiId,
    firstName: row.firstName,
    lastName: row.lastName,
    licenseNumber: row.licenseNumber,
    allowAllHomeGames: row.allowAllHomeGames,
    allowAwayGames: row.allowAwayGames,
    isOwnClub: row.isOwnClub,
    matchCount: row.matchCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getRefereeCounts(): Promise<RefereeCountsResponse> {
  const [row] = await getDb()
    .select({
      own: sql<number>`count(*) filter (where ${referees.isOwnClub})::int`,
      all: sql<number>`count(*)::int`,
    })
    .from(referees);
  return { own: row?.own ?? 0, all: row?.all ?? 0 };
}

export async function updateRefereeVisibility(
  refereeId: number,
  body: UpdateRefereeVisibilityBody,
) {
  const [updated] = await getDb()
    .update(referees)
    .set({
      allowAllHomeGames: body.allowAllHomeGames,
      allowAwayGames: body.allowAwayGames,
      isOwnClub: body.isOwnClub,
      updatedAt: new Date(),
    })
    .where(eq(referees.id, refereeId))
    .returning({
      id: referees.id,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
      isOwnClub: referees.isOwnClub,
    });

  if (!updated) {
    throw new RefereeSettingsError(`Referee ${refereeId} not found`, "NOT_FOUND");
  }

  return updated;
}

export async function updateRefereeRules(
  refereeId: number,
  body: UpdateRefereeRulesBody,
) {
  return getDb().transaction(async (tx) => {
    const [ref] = await tx
      .select({ isOwnClub: referees.isOwnClub })
      .from(referees)
      .where(eq(referees.id, refereeId))
      .limit(1);

    if (!ref) {
      throw new RefereeSettingsError(`Referee ${refereeId} not found`, "NOT_FOUND");
    }
    if (!ref.isOwnClub) {
      throw new RefereeSettingsError("Referee is not an own-club referee", "NOT_OWN_CLUB");
    }

    if (body.rules.length > 0) {
      const teamIds = body.rules.map((r) => r.teamId);
      const validTeams = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(and(inArray(teams.id, teamIds), eq(teams.isOwnClub, true)));
      const validTeamIds = new Set(validTeams.map((t) => t.id));
      const invalidIds = teamIds.filter((id) => !validTeamIds.has(id));
      if (invalidIds.length > 0) {
        throw new RefereeSettingsError(
          `Invalid or non-own-club team IDs: ${invalidIds.join(", ")}`,
          "VALIDATION_ERROR",
        );
      }
    }

    await tx
      .delete(refereeAssignmentRules)
      .where(eq(refereeAssignmentRules.refereeId, refereeId));

    if (body.rules.length > 0) {
      const now = new Date();
      await tx.insert(refereeAssignmentRules).values(
        body.rules.map((rule) => ({
          refereeId,
          teamId: rule.teamId,
          deny: rule.deny,
          allowSr1: rule.deny ? false : rule.allowSr1,
          allowSr2: rule.deny ? false : rule.allowSr2,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    const rules = await tx
      .select({
        id: refereeAssignmentRules.id,
        teamId: refereeAssignmentRules.teamId,
        teamName: teams.name,
        deny: refereeAssignmentRules.deny,
        allowSr1: refereeAssignmentRules.allowSr1,
        allowSr2: refereeAssignmentRules.allowSr2,
      })
      .from(refereeAssignmentRules)
      .innerJoin(teams, eq(refereeAssignmentRules.teamId, teams.id))
      .where(eq(refereeAssignmentRules.refereeId, refereeId));

    return { rules };
  });
}
