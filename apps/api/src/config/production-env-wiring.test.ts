import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Drift guard between the API env schema and the production Cloud Run config.
 *
 * A var declared in `config/env.ts` but absent from `infra/environments/
 * production/main.tf` is not a config error at boot — every one of these is
 * `.optional()`, so the service starts happily and the feature it gates just
 * never runs. WhatsApp delivery shipped that way: every send logged
 * "WAHA_BASE_URL not configured, skipping" in production with nothing failing.
 *
 * Parsing HCL textually is crude, but the alternative (a `tofu plan`) is not
 * available in the test environment, and the failure this catches is exactly a
 * missing identifier in a specific block.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const mainTf = readFileSync(
  join(repoRoot, "infra/environments/production/main.tf"),
  "utf8",
);

/** Extract a top-level `module "<name>" { ... }` block by brace matching. */
function moduleBlock(name: string): string {
  const start = mainTf.indexOf(`module "${name}" {`);
  if (start === -1) throw new Error(`module "${name}" not found in main.tf`);

  let depth = 0;
  for (let i = mainTf.indexOf("{", start); i < mainTf.length; i++) {
    if (mainTf[i] === "{") depth++;
    else if (mainTf[i] === "}") {
      depth--;
      if (depth === 0) return mainTf.slice(start, i + 1);
    }
  }
  throw new Error(`module "${name}" block is unterminated`);
}

const SERVICES = ["api", "worker"] as const;

describe("production Cloud Run wiring", () => {
  describe.each(SERVICES)("%s service", (service) => {
    const block = moduleBlock(service);

    // The WAHA endpoint is not a credential (the adapter sends no auth header),
    // so it belongs in env_vars, like SCOREBOARD_DEVICE_ID.
    it.each(["WAHA_BASE_URL", "WAHA_SESSION"])(
      "passes %s through env_vars",
      (name) => {
        expect(block).toContain(name);
      },
    );

    // The Expo access token is a credential: Secret Manager, never env_vars.
    it("mounts EXPO_ACCESS_TOKEN from Secret Manager", () => {
      expect(block).toContain("EXPO_ACCESS_TOKEN");
      expect(block).toContain("expo-access-token-production");
    });
  });

  it("keeps credentials out of env_vars", () => {
    for (const service of SERVICES) {
      const block = moduleBlock(service);
      // Either `env_vars = {` or `env_vars = merge({`.
      const envVarsStart = block.search(/env_vars\s*=\s*(merge\()?\{/);
      const secretsStart = block.search(/secrets\s*=\s*(merge\()?\{/);
      expect(envVarsStart).toBeGreaterThan(-1);
      expect(secretsStart).toBeGreaterThan(envVarsStart);
      const envVars = block.slice(envVarsStart, secretsStart);
      expect(envVars).not.toContain("EXPO_ACCESS_TOKEN");
    }
  });

  it("declares the expo access token secret in the secrets module", () => {
    const block = moduleBlock("secrets");
    expect(block).toContain("expo-access-token-production");
  });
});
