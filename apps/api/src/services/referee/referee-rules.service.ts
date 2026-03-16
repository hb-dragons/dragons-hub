import { db } from "../../config/database";
import { refereeAssignmentRules, teams } from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import type { RefereeRulesResponse, UpdateRefereeRulesBody } from "@dragons/shared";

export async function getRulesForReferee(refereeId: number): Promise<RefereeRulesResponse> {
  const rows = await db
    .select({
      id: refereeAssignmentRules.id,
      teamId: refereeAssignmentRules.teamId,
      teamName: teams.name,
      allowSr1: refereeAssignmentRules.allowSr1,
      allowSr2: refereeAssignmentRules.allowSr2,
    })
    .from(refereeAssignmentRules)
    .innerJoin(teams, eq(refereeAssignmentRules.teamId, teams.id))
    .where(eq(refereeAssignmentRules.refereeId, refereeId));

  return { rules: rows };
}

export async function updateRulesForReferee(
  refereeId: number,
  body: UpdateRefereeRulesBody,
): Promise<RefereeRulesResponse> {
  await db.transaction(async (tx) => {
    await tx
      .delete(refereeAssignmentRules)
      .where(eq(refereeAssignmentRules.refereeId, refereeId));

    if (body.rules.length > 0) {
      const now = new Date();
      await tx.insert(refereeAssignmentRules).values(
        body.rules.map((rule) => ({
          refereeId,
          teamId: rule.teamId,
          allowSr1: rule.allowSr1,
          allowSr2: rule.allowSr2,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  });

  return getRulesForReferee(refereeId);
}

export async function hasAnyRules(refereeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: refereeAssignmentRules.id })
    .from(refereeAssignmentRules)
    .where(eq(refereeAssignmentRules.refereeId, refereeId))
    .limit(1);

  return rows.length > 0;
}

export async function getRuleForRefereeAndTeam(
  refereeId: number,
  teamId: number,
): Promise<{ allowSr1: boolean; allowSr2: boolean } | null> {
  const [rule] = await db
    .select({
      allowSr1: refereeAssignmentRules.allowSr1,
      allowSr2: refereeAssignmentRules.allowSr2,
    })
    .from(refereeAssignmentRules)
    .where(
      and(
        eq(refereeAssignmentRules.refereeId, refereeId),
        eq(refereeAssignmentRules.teamId, teamId),
      ),
    )
    .limit(1);

  return rule ?? null;
}

export async function getAllowedTeamIdsForReferee(refereeId: number): Promise<number[]> {
  const rows = await db
    .select({ teamId: refereeAssignmentRules.teamId })
    .from(refereeAssignmentRules)
    .where(eq(refereeAssignmentRules.refereeId, refereeId));

  return rows.map((r) => r.teamId);
}
