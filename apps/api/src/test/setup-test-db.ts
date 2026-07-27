/**
 * Shared PGlite harness for the API integration tests.
 *
 * ## Recorded decision (issue #126): template restore + derived scoped reset
 *
 * Two costs dominated the api suite after the #110 migration to real SQL:
 * every test file booted a fresh PGlite and replayed all migrations
 * (`initdb` + 44 migrations, ~1.5 s per file), and `resetTestDb` ran a
 * `TRUNCATE … CASCADE` over every table plus an `ALTER SEQUENCE` per sequence
 * before every test (~42 ms per test).
 *
 * What we do instead:
 *
 * 1. **Template dump/restore.** The migrations are replayed exactly once per
 *    machine, into a throwaway PGlite whose data directory is then dumped with
 *    `dumpDataDir("none")` and cached on disk, keyed by a hash of the migration
 *    files. Every test file boots with `loadDataDir` from that tarball, which
 *    skips `initdb` and the migration replay (~1.8 s -> ~0.7 s per file). A
 *    tarball that fails to load — stale format after a PGlite upgrade, torn
 *    file — is discarded and rebuilt from the migrations, so the cache can
 *    never make a test run against a wrong schema.
 *
 * 2. **Scoped reset, derived rather than declared.** `resetTestDb` first asks
 *    the database which tables actually hold rows and which sequences have
 *    actually been advanced, then clears only those. The scope is *derived per
 *    call from live state*, so it is never wrong: a table nobody wrote to has
 *    nothing to clear, and any table that was written to is found whether or
 *    not the test file declares it. No caller has to list its tables, and
 *    there is no annotation that can silently skip a truncation. Rows are
 *    removed with `DELETE` under `session_replication_role = replica` rather
 *    than `TRUNCATE … CASCADE`: at test-fixture row counts `DELETE` is far
 *    cheaper than the per-table fixed cost of `TRUNCATE`, and the replica role
 *    lets the deletes run in arbitrary order without tripping foreign keys.
 *    The whole reset is one simple-query batch, so PostgreSQL runs it in one
 *    implicit transaction and an error rolls the `SET` back with it.
 *
 * ## Transaction-sensitive tests
 *
 * Per-test transaction rollback (open a transaction in `beforeEach`, roll it
 * back in `afterEach`) was rejected. It is the fastest option but it takes the
 * session's transaction away from the code under test, and this suite is full
 * of code that manages its own — `matches.sync.ts`, `outbox-poller.ts`,
 * `referee-admin.service.ts` and the notification pipeline all call
 * `db.transaction`, and `matches.sync.test.ts` and `event-publisher.test.ts`
 * open transactions in the test body and assert on what survives a rollback.
 * Under the strategy above nothing wraps the test:
 * every test sees a real, committed database and may `BEGIN`/`COMMIT`/`ROLLBACK`
 * exactly as production code does. The reset runs between tests, outside any
 * transaction the test managed, and it stays correct for rolled-back work too —
 * a rollback leaves no rows but still advances the sequence, and the sequence
 * probe below catches that.
 *
 * The exported signatures are unchanged from the pre-#126 harness, so test
 * files need no edits.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { createHash } from "node:crypto";
import { openAsBlob } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as schema from "@dragons/db/schema";

export interface TestDbContext {
  client: PGlite;
  db: PgliteDatabase<typeof schema>;
}

const MIGRATIONS_FOLDER = path.resolve(
  import.meta.dirname,
  "../../../../packages/db/drizzle",
);

/** Tables of a context, resolved from the live catalog on first use. */
const tablesByClient = new WeakMap<PGlite, string[]>();

/** Sequences that have been handed out at least one value. */
const ADVANCED_SEQUENCES_SQL = `
  SELECT sequencename FROM pg_sequences
  WHERE schemaname = 'public' AND last_value IS NOT NULL
`;

const PUBLIC_TABLES_SQL = `
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
`;

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Pull one text column out of an untyped `exec` result set. */
function column(rows: unknown[] | undefined, name: string): string[] {
  return (rows ?? []).map((row) => String((row as Record<string, unknown>)[name]));
}

async function publicTables(client: PGlite): Promise<string[]> {
  const cached = tablesByClient.get(client);
  if (cached) return cached;
  const result = await client.query<{ tablename: string }>(PUBLIC_TABLES_SQL);
  const tables = result.rows.map((r) => r.tablename);
  tablesByClient.set(client, tables);
  return tables;
}

/**
 * One statement that names every table currently holding at least one row.
 * `EXISTS` stops at the first tuple, so an empty table costs an empty scan.
 */
function nonEmptyTablesSql(tables: string[]): string {
  return tables
    .map(
      (t) =>
        `SELECT ${quoteLiteral(t)} AS tablename WHERE EXISTS (SELECT 1 FROM ${quoteIdent(t)})`,
    )
    .join(" UNION ALL ");
}

// ---------------------------------------------------------------------------
// Migrated-schema template
// ---------------------------------------------------------------------------

async function migrationsFingerprint(): Promise<string> {
  const entries = (await fs.readdir(MIGRATIONS_FOLDER))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const hash = createHash("sha256");
  for (const entry of entries) {
    hash.update(entry);
    hash.update(await fs.readFile(path.join(MIGRATIONS_FOLDER, entry)));
  }
  return hash.digest("hex").slice(0, 32);
}

async function templateCacheFile(): Promise<string> {
  const name = `pglite-schema-${await migrationsFingerprint()}.tar`;
  const preferred = path.resolve(
    import.meta.dirname,
    "../../node_modules/.cache/dragons-test-db",
  );
  try {
    await fs.mkdir(preferred, { recursive: true });
    return path.join(preferred, name);
  } catch {
    const fallback = path.join(os.tmpdir(), "dragons-test-db");
    await fs.mkdir(fallback, { recursive: true });
    return path.join(fallback, name);
  }
}

/** Boot an empty PGlite and replay every migration into it. */
async function migrateFreshDb(): Promise<TestDbContext> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { client, db };
}

async function writeFileAtomic(file: string, data: Uint8Array): Promise<void> {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

/**
 * Migrate a throwaway database and cache its data directory on disk. Safe to
 * run concurrently: the write is atomic, so racing builders overwrite each
 * other with byte-identical schemas.
 */
export async function buildTestDbTemplate(): Promise<void> {
  const ctx = await migrateFreshDb();
  try {
    const dump = await ctx.client.dumpDataDir("none");
    const tarball = new Uint8Array(await dump.arrayBuffer());
    try {
      await writeFileAtomic(await templateCacheFile(), tarball);
    } catch {
      // An unwritable cache only costs speed; every caller can still migrate.
    }
  } finally {
    await ctx.client.close();
  }
}

let templateBlob: Promise<Blob | undefined> | undefined;

/** `openAsBlob` streams the tarball off disk instead of buffering 40+ MB. */
async function readTemplate(): Promise<Blob | undefined> {
  try {
    return await openAsBlob(await templateCacheFile());
  } catch {
    return undefined;
  }
}

async function loadTemplate(): Promise<Blob | undefined> {
  templateBlob ??= readTemplate();
  return await templateBlob;
}

async function discardTemplate(): Promise<void> {
  templateBlob = Promise.resolve(undefined);
  try {
    await fs.rm(await templateCacheFile(), { force: true });
  } catch {
    // Best effort — the in-process handle above already stops reuse.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function setupTestDb(): Promise<TestDbContext> {
  const template = await loadTemplate();
  if (template) {
    try {
      const { PGlite } = await import("@electric-sql/pglite");
      const { drizzle } = await import("drizzle-orm/pglite");
      const client = new PGlite({ loadDataDir: template });
      await client.waitReady;
      return { client, db: drizzle(client, { schema }) };
    } catch {
      // A tarball we cannot restore must never be reused, and must never
      // stand in for the migrations: drop it and fall through to a real
      // migration run so the test still gets the schema it expects.
      await discardTemplate();
    }
  }
  return await migrateFreshDb();
}

/**
 * Return the database to its post-migration, empty state.
 *
 * The set of tables and sequences to clear is derived from live database state
 * on every call, so callers never declare a scope and a missed table is not
 * expressible.
 */
export async function resetTestDb(ctx: TestDbContext): Promise<void> {
  const tables = await publicTables(ctx.client);
  if (tables.length === 0) return;

  const [nonEmpty, advanced] = await ctx.client.exec(
    `${nonEmptyTablesSql(tables)};\n${ADVANCED_SEQUENCES_SQL}`,
  );
  const dirtyTables = column(nonEmpty?.rows, "tablename");
  const dirtySequences = column(advanced?.rows, "sequencename");
  if (dirtyTables.length === 0 && dirtySequences.length === 0) return;

  const statements: string[] = [];
  if (dirtyTables.length > 0) {
    // `replica` suppresses foreign-key triggers so the deletes need no
    // dependency ordering. It is transactional, so the implicit transaction
    // around this batch restores `origin` even if a statement fails.
    statements.push("SET session_replication_role = replica");
    for (const table of dirtyTables) {
      statements.push(`DELETE FROM ${quoteIdent(table)}`);
    }
    statements.push("SET session_replication_role = origin");
  }
  for (const sequence of dirtySequences) {
    statements.push(`ALTER SEQUENCE ${quoteIdent(sequence)} RESTART WITH 1`);
  }
  await ctx.client.exec(statements.join(";\n"));
}

export async function closeTestDb(ctx: TestDbContext): Promise<void> {
  await ctx.client.close();
}
