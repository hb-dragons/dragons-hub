import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const dbPackageJsonPath = path.join(repoRoot, "packages/db/package.json");
const guardScriptPath = path.join(repoRoot, "packages/db/scripts/no-db-push.mjs");

function readText(file: string): string {
  return readFileSync(file, "utf8");
}

/**
 * `drizzle-kit push` diffs the TS schema against the live database and drops
 * whatever the schema does not declare — including three indexes that exist only
 * in hand-written SQL migrations. It must not be reachable.
 */
describe("db:push is removed and guarded", () => {
  it("has no script that invokes drizzle-kit push", () => {
    const pkg = JSON.parse(readText(dbPackageJsonPath)) as {
      scripts: Record<string, string>;
    };
    const pushing = Object.entries(pkg.scripts).filter(([, cmd]) =>
      /drizzle-kit\s+push/.test(cmd),
    );
    expect(pushing).toEqual([]);
  });

  it("routes the db:push script name to a guard that refuses to run", async () => {
    const pkg = JSON.parse(readText(dbPackageJsonPath)) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["db:push"]).toContain("no-db-push.mjs");

    await expect(execFileAsync(process.execPath, [guardScriptPath])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("db:push is disabled"),
    });
  });

  it("makes drizzle.config.ts refuse a direct `drizzle-kit push` invocation", () => {
    const config = readText(path.join(repoRoot, "packages/db/drizzle.config.ts"));
    expect(config).toMatch(/argv/);
    expect(config).toMatch(/push/);
  });

  it("no longer documents db:push as a workflow command", () => {
    const claudeMd = readText(path.join(repoRoot, "CLAUDE.md"));
    expect(claudeMd).not.toMatch(/^\s*pnpm .*db:push/m);
  });

  it("does not offer a push action in the database migrations workflow", () => {
    const workflow = readText(
      path.join(repoRoot, ".github/workflows/db-migrations.yml"),
    );
    expect(workflow).not.toMatch(/db:push/);
    expect(workflow).not.toMatch(/inputs\.action == 'push'/);
  });
});
