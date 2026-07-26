import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { setupTestDb, closeTestDb, type TestDbContext } from "./setup-test-db";

/**
 * Three indexes exist only in hand-written SQL migrations and are absent from
 * the drizzle-kit snapshot chain (see `packages/db/drizzle/README.md`). They are
 * therefore invisible to `drizzle-kit`, which is why `db:push` is disabled.
 *
 * These assertions pin the indexes to the migration chain: a database built by
 * `db:migrate` must have all three, with exactly the definitions the code
 * expects. `notification_log_dedup_idx` in particular is the index that the
 * explicit `on conflict` target in `insertNotificationLogDeduped` arbitrates
 * against — if its definition drifts, that insert starts failing with
 * "no unique or exclusion constraint matching the ON CONFLICT specification".
 */
let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function indexDef(name: string): Promise<string | undefined> {
  const result = await ctx.client.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [name],
  );
  return result.rows[0]?.indexdef;
}

describe("migration-created indexes", () => {
  it("keeps the COALESCE-based notification dedup index", async () => {
    expect(await indexDef("notification_log_dedup_idx")).toBe(
      "CREATE UNIQUE INDEX notification_log_dedup_idx ON public.notification_log " +
        "USING btree (event_id, channel_config_id, COALESCE(recipient_id, '__group__'::text))",
    );
  });

  it("keeps the partial outbox poll index", async () => {
    expect(await indexDef("domain_events_outbox_idx")).toBe(
      "CREATE INDEX domain_events_outbox_idx ON public.domain_events " +
        "USING btree (created_at) WHERE (processed_at IS NULL)",
    );
  });

  it("keeps the referee open-slot listing index", async () => {
    expect(await indexDef("referee_games_status_kickoff_idx")).toBe(
      "CREATE INDEX referee_games_status_kickoff_idx ON public.referee_games " +
        "USING btree (sr1_status, sr2_status, kickoff_date)",
    );
  });
});
