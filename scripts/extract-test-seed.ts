import { config } from "dotenv";
config();

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Make sure .env exists.");
  process.exit(1);
}

// Tables to extract in FK-safe order.
// Key = camelCase name used in seed.json (matches Drizzle schema export names).
// Value = actual PostgreSQL table name.
const TABLES: [string, string][] = [
  ["leagues", "leagues"],
  ["teams", "teams"],
  ["referees", "referees"],
  ["refereeRoles", "referee_roles"],
  ["venues", "venues"],
  ["standings", "standings"],
  ["matches", "matches"],
  ["matchOverrides", "match_overrides"],
  ["matchRemoteVersions", "match_remote_versions"],
  ["matchLocalVersions", "match_local_versions"],
  ["matchChanges", "match_changes"],
  ["matchReferees", "match_referees"],
  ["refereeAssignmentIntents", "referee_assignment_intents"],
  ["refereeAssignmentRules", "referee_assignment_rules"],
  ["appSettings", "app_settings"],
];

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    const tables: Record<string, unknown[]> = {};

    for (const [key, tableName] of TABLES) {
      const result = await pool.query(
        `SELECT * FROM "${tableName}" ORDER BY id`,
      );
      tables[key] = result.rows;
      console.log(`  ${tableName}: ${result.rows.length} rows`);
    }

    const seed = {
      extractedAt: new Date().toISOString(),
      tables,
    };

    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { resolve } = await import("node:path");

    const outDir = resolve(
      import.meta.dirname,
      "../apps/api/src/test/fixtures",
    );
    mkdirSync(outDir, { recursive: true });

    const outPath = resolve(outDir, "seed.json");
    writeFileSync(outPath, JSON.stringify(seed, null, 2) + "\n");
    console.log(`\nSeed data written to ${outPath}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Extraction failed:", err);
  process.exit(1);
});
