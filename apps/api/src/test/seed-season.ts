import { seasons } from "@dragons/db/schema";
import type { TestDbContext } from "./setup-test-db";

/**
 * Insert one active season and return its id.
 *
 * `leagues.seasonRefId` is NOT NULL, so every fixture that seeds a league needs
 * a season to hang it off — including the many suites that have nothing to say
 * about seasons and only need one to exist. Season *behaviour* is covered
 * deliberately elsewhere: `season.service.test.ts` (lifecycle),
 * `season-isolation.integration.test.ts` (reads follow activation), and the
 * season-gate tests beside `data-fetcher` and `leagues.sync`.
 *
 * Call it once per test. A partial unique index allows only one active season,
 * so a second call inside the same test violates it — which is the constraint
 * doing its job, not a helper bug.
 */
export async function seedActiveSeason(
  ctx: TestDbContext,
  name = "2025/26",
): Promise<number> {
  const [row] = await ctx.db
    .insert(seasons)
    .values({ name, status: "active" })
    .returning({ id: seasons.id });
  return row!.id;
}
