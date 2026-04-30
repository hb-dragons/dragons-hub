import type { PGlite } from "@electric-sql/pglite";
import * as path from "node:path";
import * as schema from "@dragons/db/schema";

type PgliteDatabase = import("drizzle-orm/pglite").PgliteDatabase<typeof schema>;

export interface TestDbContext {
  client: PGlite;
  db: PgliteDatabase;
}

export async function setupTestDb(): Promise<TestDbContext> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  const migrationsFolder = path.resolve(
    import.meta.dirname,
    "../../../../packages/db/drizzle",
  );
  await migrate(db, { migrationsFolder });

  return { client, db };
}

export async function resetTestDb(ctx: TestDbContext): Promise<void> {
  await ctx.client.exec(`
    TRUNCATE
      match_changes, match_remote_versions, match_local_versions,
      match_overrides, match_referees, referee_assignment_intents,
      referee_assignment_rules, referee_roles, referee_games,
      referees, standings, matches, teams, venues, leagues,
      sync_run_entries, sync_runs, sync_schedule,
      domain_events, notifications, notification_log,
      digest_buffer, watch_rules, channel_configs,
      user_notification_preferences,
      venue_booking_matches, venue_bookings,
      board_columns, tasks, task_assignees, task_checklist_items,
      task_comments, boards,
      push_devices, player_photos, social_backgrounds,
      app_settings,
      scoreboard_snapshots, live_scoreboards,
      broadcast_configs,
      "user", session, account, verification
    CASCADE
  `);

  // Reset all sequences to 1
  const seqs = await ctx.client.query<{ sequencename: string }>(`
    SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
  `);
  for (const row of seqs.rows) {
    await ctx.client.exec(
      `ALTER SEQUENCE "${row.sequencename}" RESTART WITH 1`,
    );
  }
}

export async function closeTestDb(ctx: TestDbContext): Promise<void> {
  await ctx.client.close();
}
