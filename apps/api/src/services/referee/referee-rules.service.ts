import { getDb } from "../../config/database";
import { refereeAssignmentRules, referees, teams } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import type { RefereeRulesResponse } from "@dragons/shared";
import { RefereeSettingsError } from "../admin/referee-admin.errors";

export async function getRulesForReferee(refereeId: number): Promise<RefereeRulesResponse> {
  const [referee] = await getDb()
    .select({ isOwnClub: referees.isOwnClub })
    .from(referees)
    .where(eq(referees.id, refereeId))
    .limit(1);

  if (!referee) {
    throw new RefereeSettingsError("Referee not found", "NOT_FOUND");
  }
  if (!referee.isOwnClub) {
    throw new RefereeSettingsError("Referee is not an own-club referee", "NOT_OWN_CLUB");
  }

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
