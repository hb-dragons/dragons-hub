import { getDb } from "../../config/database";
import { refereeAssignmentRules, teams } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import type { RefereeRulesResponse } from "@dragons/shared";

export async function getRulesForReferee(refereeId: number): Promise<RefereeRulesResponse> {
  const rows = await getDb()
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

  return { rules: rows };
}
