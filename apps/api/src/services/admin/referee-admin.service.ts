import { db } from "../../config/database";
import { referees, refereeRoles, matchReferees } from "@dragons/db/schema";
import { sql, asc, ilike, and, or, eq } from "drizzle-orm";
import type {
  RefereeListItem,
  PaginatedResponse,
  UpdateRefereeVisibilityBody,
} from "@dragons/shared";

export interface RefereeListParams {
  limit: number;
  offset: number;
  search?: string;
}

export async function getReferees(
  params: RefereeListParams,
): Promise<PaginatedResponse<RefereeListItem>> {
  const { limit, offset, search } = params;

  const conditions = [];
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
    matchCount: row.matchCount,
    roles: rolesByReferee.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return { items, total, limit, offset, hasMore: offset + items.length < total };
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
      updatedAt: new Date(),
    })
    .where(eq(referees.id, refereeId))
    .returning({
      id: referees.id,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
    });

  if (!updated) {
    throw new Error(`Referee ${refereeId} not found`);
  }

  return updated;
}
