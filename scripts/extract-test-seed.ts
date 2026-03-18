import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Make sure .env exists.");
  process.exit(1);
}

// Tables to extract in FK-safe order.
// Key = camelCase name used in seed.json (matches Drizzle schema export names).
// Value = actual PostgreSQL table name.
// Query = optional custom query (defaults to SELECT * ORDER BY id).
const TABLES: [string, string, string?][] = [
  ["leagues", "leagues"],
  ["teams", "teams"],
  ["referees", "referees"],
  ["refereeRoles", "referee_roles"],
  ["venues", "venues"],
  ["standings", "standings"],
  ["matches", "matches"],
  ["matchOverrides", "match_overrides"],
  // Limit version/change history to the latest version per match to keep fixture small
  [
    "matchRemoteVersions",
    "match_remote_versions",
    `SELECT v.* FROM match_remote_versions v
     INNER JOIN (
       SELECT match_id, MAX(version_number) AS max_v
       FROM match_remote_versions GROUP BY match_id
     ) latest ON v.match_id = latest.match_id AND v.version_number = latest.max_v
     ORDER BY v.id`,
  ],
  [
    "matchLocalVersions",
    "match_local_versions",
    `SELECT v.* FROM match_local_versions v
     INNER JOIN (
       SELECT match_id, MAX(version_number) AS max_v
       FROM match_local_versions GROUP BY match_id
     ) latest ON v.match_id = latest.match_id AND v.version_number = latest.max_v
     ORDER BY v.id`,
  ],
  // Limit changes to last 500 to keep fixture manageable
  [
    "matchChanges",
    "match_changes",
    `SELECT * FROM match_changes ORDER BY id DESC LIMIT 500`,
  ],
  ["matchReferees", "match_referees"],
  ["refereeAssignmentIntents", "referee_assignment_intents"],
  ["refereeAssignmentRules", "referee_assignment_rules"],
  ["appSettings", "app_settings"],
];

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    const tables: Record<string, unknown[]> = {};

    for (const [key, tableName, customQuery] of TABLES) {
      const query = customQuery ?? `SELECT * FROM "${tableName}" ORDER BY id`;
      const result = await pool.query(query);
      tables[key] = result.rows;
      console.log(`  ${tableName}: ${result.rows.length} rows`);
    }

    const seed = {
      extractedAt: new Date().toISOString(),
      tables,
    };

    const { writeFileSync, mkdirSync } = await import("node:fs");

    const outDir = path.resolve(__dirname, "../apps/api/src/test/fixtures");
    mkdirSync(outDir, { recursive: true });

    const outPath = path.resolve(outDir, "seed.json");
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
