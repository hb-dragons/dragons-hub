import { asc, desc } from "drizzle-orm";
import { teams, type Team } from "@dragons/db/schema";
import { getDb } from "../../config/database";

/**
 * Public team list: own-club teams first, then by the manually-curated
 * `displayOrder`, then alphabetically. No auth, no filtering — every row
 * in `teams` is public.
 */
export async function listPublicTeams(): Promise<Team[]> {
  return getDb()
    .select()
    .from(teams)
    .orderBy(desc(teams.isOwnClub), asc(teams.displayOrder), asc(teams.name));
}
