import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "@dragons/db/schema";
import type { TestDbContext } from "./setup-test-db";

interface SeedData {
  extractedAt: string;
  tables: {
    leagues?: Record<string, unknown>[];
    teams?: Record<string, unknown>[];
    referees?: Record<string, unknown>[];
    refereeRoles?: Record<string, unknown>[];
    venues?: Record<string, unknown>[];
    standings?: Record<string, unknown>[];
    matches?: Record<string, unknown>[];
    matchOverrides?: Record<string, unknown>[];
    matchRemoteVersions?: Record<string, unknown>[];
    matchLocalVersions?: Record<string, unknown>[];
    matchChanges?: Record<string, unknown>[];
    matchReferees?: Record<string, unknown>[];
    refereeAssignmentIntents?: Record<string, unknown>[];
    refereeAssignmentRules?: Record<string, unknown>[];
    appSettings?: Record<string, unknown>[];
  };
}

// FK-safe insertion order: each entry is [seedKey, drizzleTable]
const INSERTION_ORDER: [keyof SeedData["tables"], unknown][] = [
  ["leagues", schema.leagues],
  ["teams", schema.teams],
  ["referees", schema.referees],
  ["refereeRoles", schema.refereeRoles],
  ["venues", schema.venues],
  ["standings", schema.standings],
  ["matches", schema.matches],
  ["matchOverrides", schema.matchOverrides],
  ["matchRemoteVersions", schema.matchRemoteVersions],
  ["matchLocalVersions", schema.matchLocalVersions],
  ["matchChanges", schema.matchChanges],
  ["matchReferees", schema.matchReferees],
  ["refereeAssignmentIntents", schema.refereeAssignmentIntents],
  ["refereeAssignmentRules", schema.refereeAssignmentRules],
  ["appSettings", schema.appSettings],
];

export async function seedTestDb(ctx: TestDbContext): Promise<void> {
  const fixturePath = path.resolve(
    import.meta.dirname,
    "fixtures/seed.json",
  );
  const raw = fs.readFileSync(fixturePath, "utf-8");
  const seed: SeedData = JSON.parse(raw);

  for (const [key, table] of INSERTION_ORDER) {
    const rows = seed.tables[key];
    if (rows && rows.length > 0) {
      // Insert in batches of 100 to avoid parameter limits
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (ctx.db.insert(table as any).values(batch as any) as any);
      }
    }
  }

  // Advance sequences past the highest inserted IDs to prevent conflicts
  // when tests insert additional rows after seeding.
  const serialTables = await ctx.client.query<{
    table_name: string;
    seq_name: string;
  }>(`
    SELECT t.table_name, pg_get_serial_sequence(t.table_name, 'id') AS seq_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND pg_get_serial_sequence(t.table_name, 'id') IS NOT NULL
  `);
  for (const { table_name, seq_name } of serialTables.rows) {
    await ctx.client.exec(
      `SELECT setval('${seq_name}', COALESCE((SELECT MAX(id) FROM "${table_name}"), 1))`,
    );
  }
}
