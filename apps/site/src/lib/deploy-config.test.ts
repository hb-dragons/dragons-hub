import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Issue #260. The Apache config under deploy/ is hand-written, ships in every
// release and is traversed by live traffic, but nothing executes it until a
// human renames it into place. This test reads it from disk the way
// legal-citations.test.ts reads the legal pages, so the one rule we know can
// take the whole site down fails the build instead of Phase 1.

const DEPLOY = fileURLToPath(new URL("../../deploy/", import.meta.url));
const RELEASE_HTACCESS = readFileSync(join(DEPLOY, "htaccess-release"), "utf8");

/** Directives Apache rejects with a 500 when their module is not loaded. */
const MODULE_GATED = [
  { directive: /^\s*Header\s/m, module: "mod_headers.c" },
  { directive: /^\s*SetEnvIf\s/m, module: "mod_setenvif.c" },
];

describe("deploy/htaccess-release", () => {
  it("was actually found", () => {
    expect(RELEASE_HTACCESS).toContain("X-Robots-Tag");
  });

  // An unloaded module makes Apache 500 the whole directory rather than skip
  // the line, and this file is the docroot for the testing host while live
  // apex traffic passes through it via current/.
  it.each(MODULE_GATED)("guards $module before using its directives", ({ directive, module }) => {
    if (!directive.test(RELEASE_HTACCESS)) return;
    const guard = new RegExp(`<IfModule\\s+${module.replace(".", "\\.")}>`);
    expect(RELEASE_HTACCESS).toMatch(guard);
  });

  it("keeps the noindex header gated to the testing host", () => {
    expect(RELEASE_HTACCESS).toMatch(/X-Robots-Tag[^\n]*env=TESTING_HOST/);
    expect(RELEASE_HTACCESS).toMatch(/SetEnvIf\s+Host\s+\^site\\?\.testing\\?\./);
  });
});
