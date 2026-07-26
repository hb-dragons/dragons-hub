# Migrations

`db:generate` + `db:migrate` is the only schema-sync path in this repo.

## `drizzle-kit push` is disabled

`push` diffs the TypeScript schema against the live database and drops anything the
schema does not declare. Three production indexes are written by hand-written SQL
migrations and are absent from the drizzle-kit snapshots, so `push` sees them as
"not in the schema" and removes them:

| Index | Created by | Purpose |
| --- | --- | --- |
| `notification_log_dedup_idx` (UNIQUE, `COALESCE`-based) | `0018_slippery_randall_flagg.sql` | notification dedup |
| `domain_events_outbox_idx` (partial, `WHERE processed_at IS NULL`) | `0019_outbox_partial_index.sql`, recreated in `0040_brainy_photon.sql` | outbox poll scan |
| `referee_games_status_kickoff_idx` | `0035_referee_games_status_kickoff_index.sql` | open-slot listing |

Two guards enforce this:

- `packages/db/package.json` maps the `db:push` script name to `scripts/no-db-push.mjs`,
  which prints an explanation and exits 1.
- `drizzle.config.ts` throws when `push` appears in `process.argv`, which also catches
  `pnpm exec drizzle-kit push` and `npx drizzle-kit push`.

`apps/api/src/test/db-push-guard.test.ts` asserts both guards stay in place, and
`apps/api/src/test/migration-indexes.test.ts` asserts a database built from migrations
really has all three indexes with the expected definitions.

### Dedup no longer depends on an invisible index

Inserts into `notification_log` go through `insertNotificationLogDeduped`
(`apps/api/src/services/notifications/notification-log-dedup.ts`), which spells the
conflict target out:

```sql
on conflict (event_id, channel_config_id, coalesce(recipient_id, '__group__')) do nothing
```

A bare `onConflictDoNothing()` arbitrates against whatever unique indexes happen to
exist, so a missing dedup index would succeed and write a duplicate notification with no
error. With the target named, Postgres raises `42P10` instead — a loud failure rather
than unbounded duplicate notifications.

## Snapshot gaps at 0019, 0028 and 0035 are intentional

`meta/_journal.json` has 41 entries (idx 0–40) but `meta/` holds 38 `*_snapshot.json`
files. Snapshots are missing for exactly the three hand-written migrations:

- `0019_outbox_partial_index`
- `0028_rbac_role_cleanup`
- `0035_referee_games_status_kickoff_index`

These were authored as SQL rather than produced by `drizzle-kit generate`, so no
snapshot was ever written for them. This is left as-is on purpose:

- `db:migrate` reads `_journal.json` and the `.sql` files; it never reads snapshots, so
  every migration applies normally.
- `db:generate` diffs the current schema against the *latest* snapshot
  (`0040_snapshot.json`), which exists. Intermediate snapshots are not consulted.
- `drizzle-kit check` passes (verified).

Back-filling the three snapshots would mean hand-writing drizzle-kit internal state to
describe changes it never generated — more risk than the gap it closes. If you add a
hand-written migration, add its journal entry and expect no snapshot for it, and add its
indexes to the table above plus `migration-indexes.test.ts`.
