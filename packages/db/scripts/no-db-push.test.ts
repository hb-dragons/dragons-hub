import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./no-db-push.mjs", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));

function runGuard() {
  return spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
}

describe("db:push guard script", () => {
  it("exits non-zero so a scripted `db:push` fails the caller", () => {
    expect(runGuard().status).toBe(1);
  });

  it("explains the refusal on stderr, not stdout", () => {
    const { stdout, stderr } = runGuard();

    expect(stdout).toBe("");
    expect(stderr).toContain("db:push is disabled in this repo");
  });

  it("names the three indexes and the workflow to use instead", () => {
    const { stderr } = runGuard();

    expect(stderr).toContain("notification_log_dedup_idx");
    expect(stderr).toContain("domain_events_outbox_idx");
    expect(stderr).toContain("referee_games_status_kickoff_idx");
    expect(stderr).toContain("db:generate");
    expect(stderr).toContain("db:migrate");
  });

  it("is what the db:push package script actually runs", () => {
    // A guard nobody invokes is not a guard. If db:push is ever pointed back
    // at drizzle-kit, this fails.
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["db:push"]).toContain("no-db-push.mjs");
    expect(pkg.scripts?.["db:push"]).not.toContain("drizzle-kit");
  });
});
