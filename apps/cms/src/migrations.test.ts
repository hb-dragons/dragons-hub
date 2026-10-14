// The committed migrations are the only thing that shapes the production
// schema (`prodMigrations`, run at boot), while dev runs in push mode and never
// notices a missing one. This replays `payload migrate:create`'s own diff — the
// config's drizzle schema against the latest migration snapshot — and fails if
// it would emit any SQL.
//
// GCS_MEDIA_BUCKET is set because production runs the storage plugin and it
// adds columns of its own: the 3.90 migration was generated without it, missed
// `media._objectkey`, and every media read 500ed in production.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Payload } from "payload";

const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");

let payload: Payload;

beforeAll(async () => {
  vi.stubEnv("GCS_MEDIA_BUCKET", "drift-check-bucket");
  vi.stubEnv("PAYLOAD_SECRET", "drift-check-secret");
  // Never connected to: disableDBConnect below skips the pool entirely.
  vi.stubEnv("DATABASE_URL_CMS", "postgresql://unused@localhost:1/unused");
  const { getPayload } = await import("payload");
  const { default: config } = await import("./payload.config");
  payload = await getPayload({ config, disableDBConnect: true, disableOnInit: true });
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await payload?.destroy();
});

describe("migrations", () => {
  it("cover every column the production config (GCS on) declares", async () => {
    const db = payload.db as unknown as {
      schema: Record<string, unknown>;
      requireDrizzleKit: () => {
        generateDrizzleJson: (schema: Record<string, unknown>) => Promise<unknown>;
        generateMigration: (before: unknown, after: unknown) => Promise<string[]>;
      };
    };
    const { generateDrizzleJson, generateMigration } = db.requireDrizzleKit();

    const latestSnapshot = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .at(-1);
    expect(latestSnapshot).toBeDefined();
    const before: unknown = JSON.parse(
      fs.readFileSync(path.join(migrationDir, latestSnapshot!), "utf8"),
    );
    const after = await generateDrizzleJson(db.schema);

    // Non-empty means: run `payload migrate:create` with GCS_MEDIA_BUCKET set.
    expect(await generateMigration(before, after)).toEqual([]);
  }, 60_000);
});
