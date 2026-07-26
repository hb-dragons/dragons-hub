#!/usr/bin/env node
/**
 * `db:push` is disabled on purpose.
 *
 * `drizzle-kit push` diffs the TypeScript schema against the live database and
 * drops anything the schema does not declare. Three production indexes exist
 * only in hand-written SQL migrations and are invisible to drizzle-kit:
 *
 *   notification_log_dedup_idx        (UNIQUE, COALESCE-based)
 *   domain_events_outbox_idx          (partial, WHERE processed_at IS NULL)
 *   referee_games_status_kickoff_idx
 *
 * See packages/db/drizzle/README.md.
 */
process.stderr.write(
  [
    "",
    "  db:push is disabled in this repo.",
    "",
    "  `drizzle-kit push` drops indexes it cannot see in the TS schema, and three",
    "  production indexes live only in hand-written SQL migrations:",
    "    - notification_log_dedup_idx        (UNIQUE, COALESCE-based)",
    "    - domain_events_outbox_idx          (partial, WHERE processed_at IS NULL)",
    "    - referee_games_status_kickoff_idx",
    "",
    "  Use the migration workflow instead:",
    "    pnpm --filter @dragons/db db:generate   # write a migration",
    "    pnpm --filter @dragons/db db:migrate    # apply it",
    "",
    "  Background: packages/db/drizzle/README.md",
    "",
  ].join("\n"),
);
process.exit(1);
