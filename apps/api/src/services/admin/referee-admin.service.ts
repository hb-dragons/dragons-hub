import { db } from "../../config/database";
import {
  referees,
  refereeRoles,
  matchReferees,
  refereeAssignmentRules,
  teams,
} from "@dragons/db/schema";
import { sql, asc, ilike, and, or, eq, inArray } from "drizzle-orm";
import type {
  RefereeListItem,
  PaginatedResponse,
  UpdateRefereeVisibilityBody,
  UpdateRefereeSettingsBody,
  UpdateRefereeSettingsResponse,
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

export interface RefereeListParams {
  limit: number;
  offset: number;
  search?: string;
  ownClub: boolean;
}

export async function getReferees(
  params: RefereeListParams,
): Promise<PaginatedResponse<RefereeListItem>> {
  const { limit, offset, search, ownClub } = params;

  const conditions = [];
  if (ownClub) {
    conditions.push(eq(referees.isOwnClub, true));
  }
  if (search) {
    conditions.push(
      or(
        ilike(referees.firstName, `%${search}%`),
        ilike(referees.lastName, `%${search}%`),
      ),
    );
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: referees.id,
        apiId: referees.apiId,
        firstName: referees.firstName,
        lastName: referees.lastName,
        licenseNumber: referees.licenseNumber,
        allowAllHomeGames: referees.allowAllHomeGames,
        allowAwayGames: referees.allowAwayGames,
        isOwnClub: referees.isOwnClub,
        matchCount: sql<number>`count(distinct ${matchReferees.matchId})::int`,
        createdAt: referees.createdAt,
        updatedAt: referees.updatedAt,
      })
      .from(referees)
      .leftJoin(matchReferees, eq(matchReferees.refereeId, referees.id))
      .where(whereClause)
      .groupBy(referees.id)
      .orderBy(asc(referees.lastName), asc(referees.firstName))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(referees)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  // Load roles for all referees in one query
  const refereeIds = rows.map((r) => r.id);
  const roleRows =
    refereeIds.length > 0
      ? await db
          .selectDistinct({
            refereeId: matchReferees.refereeId,
            roleName: refereeRoles.name,
          })
          .from(matchReferees)
          .innerJoin(refereeRoles, eq(matchReferees.roleId, refereeRoles.id))
          .where(
            sql`${matchReferees.refereeId} in ${refereeIds}`,
          )
      : [];

  const rolesByReferee = new Map<number, string[]>();
  for (const r of roleRows) {
    const existing = rolesByReferee.get(r.refereeId) ?? [];
    existing.push(r.roleName);
    rolesByReferee.set(r.refereeId, existing);
  }

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
    roles: rolesByReferee.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return { items, total, limit, offset, hasMore: offset + items.length < total };
}

export async function updateRefereeSettings(
  refereeId: number,
  body: UpdateRefereeSettingsBody,
): Promise<UpdateRefereeSettingsResponse> {
  return db.transaction(async (tx) => {
    let visibility: {
      allowAllHomeGames: boolean;
      allowAwayGames: boolean;
      isOwnClub: boolean;
    };

    if (body.visibility) {
      const [updated] = await tx
        .update(referees)
        .set({
          allowAllHomeGames: body.visibility.allowAllHomeGames,
          allowAwayGames: body.visibility.allowAwayGames,
          isOwnClub: body.visibility.isOwnClub,
          updatedAt: new Date(),
        })
        .where(eq(referees.id, refereeId))
        .returning({
          allowAllHomeGames: referees.allowAllHomeGames,
          allowAwayGames: referees.allowAwayGames,
          isOwnClub: referees.isOwnClub,
        });
      if (!updated) {
        throw new RefereeSettingsError(
          `Referee ${refereeId} not found`,
          "NOT_FOUND",
        );
      }
      visibility = updated;
    } else {
      const [row] = await tx
        .select({
          allowAllHomeGames: referees.allowAllHomeGames,
          allowAwayGames: referees.allowAwayGames,
          isOwnClub: referees.isOwnClub,
        })
        .from(referees)
        .where(eq(referees.id, refereeId))
        .limit(1);
      if (!row) {
        throw new RefereeSettingsError(
          `Referee ${refereeId} not found`,
          "NOT_FOUND",
        );
      }
      visibility = row;
    }

    if (body.rules !== undefined) {
      if (!visibility.isOwnClub) {
        throw new RefereeSettingsError(
          "Referee is not an own-club referee",
          "NOT_OWN_CLUB",
        );
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

    return { visibility, rules };
  });
}

export async function updateRefereeVisibility(
  refereeId: number,
  body: UpdateRefereeVisibilityBody,
) {
  const [updated] = await db
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
    throw new Error(`Referee ${refereeId} not found`);
  }

  return updated;
}
