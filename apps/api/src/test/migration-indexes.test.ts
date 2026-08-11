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

/**
 * Indexes added by migration 0042. Each backs a lookup or a referential-integrity
 * check that previously had to seq-scan.
 */
describe("single-column lookup indexes", () => {
  it.each([
    // The composite unique (league_id, team_api_id) cannot serve a team-only
    // lookup, and two services filter on team_api_id alone.
    ["standings_team_api_id_idx", "standings", "team_api_id"],
    // Cascade-delete of a user, and every session-by-user lookup.
    ["session_user_id_idx", "session", "user_id"],
    // The FK check Postgres runs on every channel_configs write.
    ["notification_log_channel_config_idx", "notification_log", "channel_config_id"],
    ["broadcast_configs_match_id_idx", "broadcast_configs", "match_id"],
    ["channel_configs_deleted_at_idx", "channel_configs", "deleted_at"],
  ])("has %s", async (name, table, column) => {
    expect(await indexDef(name)).toBe(
      `CREATE INDEX ${name} ON public.${table} USING btree (${column})`,
    );
  });

  it("no longer carries standings_league_id_idx, a strict prefix of the composite unique", async () => {
    expect(await indexDef("standings_league_id_idx")).toBeUndefined();
    // …and the composite that made it redundant is still there.
    expect(await indexDef("standings_league_team_unique")).toBe(
      "CREATE UNIQUE INDEX standings_league_team_unique ON public.standings " +
        "USING btree (league_id, team_api_id)",
    );
  });
});

/** Match-deletion behaviour, defined by migration 0042. */
describe("foreign keys to matches.id", () => {
  /** pg encodes: a = NO ACTION, c = CASCADE, n = SET NULL, r = RESTRICT. */
  async function deleteRule(table: string, constraint: string): Promise<string | undefined> {
    const result = await ctx.client.query<{ confdeltype: string }>(
      `SELECT c.confdeltype FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = $1 AND c.contype = 'f' AND c.conname = $2`,
      [table, constraint],
    );
    return result.rows[0]?.confdeltype;
  }

  it("cascades the booking↔match link, which cannot exist without the match", async () => {
    expect(
      await deleteRule("venue_booking_matches", "venue_booking_matches_match_id_matches_id_fk"),
    ).toBe("c");
  });

  it("unlinks referee_games rather than destroying the officiating record", async () => {
    expect(await deleteRule("referee_games", "referee_games_match_id_matches_id_fk")).toBe("n");
  });

  it("unbinds a broadcast device rather than deleting its configuration", async () => {
    expect(
      await deleteRule("broadcast_configs", "broadcast_configs_match_id_matches_id_fk"),
    ).toBe("n");
  });

  it("cascades buffered digest entries off a deleted channel config", async () => {
    expect(
      await deleteRule("digest_buffer", "digest_buffer_channel_config_id_channel_configs_id_fk"),
    ).toBe("c");
  });

  it("keeps notification_log pinned to its channel config, so the audit trail cannot be cascaded away", async () => {
    expect(
      await deleteRule(
        "notification_log",
        "notification_log_channel_config_id_channel_configs_id_fk",
      ),
    ).toBe("a");
  });
});

describe("matches status flags", () => {
  it.each(["is_confirmed", "is_forfeited", "is_cancelled"])(
    "%s is NOT NULL, so `WHERE … = false` cannot silently drop rows",
    async (column) => {
      const result = await ctx.client.query<{ is_nullable: string; column_default: string }>(
        `SELECT is_nullable, column_default FROM information_schema.columns
          WHERE table_name = 'matches' AND column_name = $1`,
        [column],
      );
      expect(result.rows[0]?.is_nullable).toBe("NO");
      expect(result.rows[0]?.column_default).toBe("false");
    },
  );
});
