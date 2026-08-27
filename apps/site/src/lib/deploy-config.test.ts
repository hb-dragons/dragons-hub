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
const DEPLOY_WORKFLOW = readFileSync(
  fileURLToPath(new URL("../../../../.github/workflows/deploy-site.yml", import.meta.url)),
  "utf8",
);

/** Directives Apache rejects with a 500 when their module is not loaded. */
const MODULE_GATED = [
  { directive: /^\s*Header\s/m, module: "mod_headers.c" },
  { directive: /^\s*SetEnvIf\s/m, module: "mod_setenvif.c" },
  // AddOutputFilterByType is mod_filter's, not mod_deflate's, so the compression
  // block needs both guards or a host with deflate but no filter 500s.
  { directive: /^\s*AddOutputFilterByType\s/m, module: "mod_deflate.c" },
  { directive: /^\s*AddOutputFilterByType\s/m, module: "mod_filter.c" },
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

  // Only Astro's output is content-hashed. Caching anything else immutably
  // strands a stale file in every visitor's cache for a year, with no URL
  // change available to bust it.
  it("scopes the immutable cache to the content-hashed _astro/ path", () => {
    expect(RELEASE_HTACCESS).toMatch(/SetEnvIf\s+Request_URI\s+"\/_astro\/"\s+HASHED_ASSET/);
    expect(RELEASE_HTACCESS).toMatch(/Cache-Control\s+"[^"]*immutable"\s+env=HASHED_ASSET/);
  });

  it("does not let the unhashed-asset rule swallow a hashed one", () => {
    const rule = RELEASE_HTACCESS.match(/Header set Cache-Control "public, max-age=86400"[^\n]*/);
    expect(rule?.[0]).toContain("env=!HASHED_ASSET");
  });

  // A deploy repoints `current` under the same URLs, and the pruner deletes the
  // previous release's hashed assets after five more. A cached HTML page would
  // outlive the assets it references.
  it("forbids caching HTML across a release swap", () => {
    expect(RELEASE_HTACCESS).toMatch(/<FilesMatch\s+"\\\.\(\?:\)?html\$"|\\\.html\$/);
    expect(RELEASE_HTACCESS).toMatch(/Header set Cache-Control "no-cache"/);
  });

  it("compresses the text types the host serves uncompressed", () => {
    // Join the directive's backslash continuations before matching it.
    const unwrapped = RELEASE_HTACCESS.replace(/\\\n\s*/g, " ");
    const filter = unwrapped.match(/^\s*AddOutputFilterByType DEFLATE .*$/m)?.[0] ?? "";
    expect(filter).toContain("text/html");
    expect(filter).toContain("text/css");
    expect(filter).toContain("application/javascript");
  });
});

// Issue #269: an empty CMS produced a content-less build that passed every
// gate — index.html and 404.html are static, and the smoke test's
// case-insensitive "dragons" matched the NavBar logo alt. The workflow is
// shell in YAML, so the gates are asserted here rather than left to a failed
// production deploy.
describe("deploy-site workflow content gates", () => {
  it("was actually found", () => {
    expect(DEPLOY_WORKFLOW).toContain("name: Deploy Site");
  });

  it("counts emitted team and news pages before uploading", () => {
    expect(DEPLOY_WORKFLOW).toMatch(/TEAMS=\$\(count_pages teams\)/);
    expect(DEPLOY_WORKFLOW).toMatch(/NEWS=\$\(count_pages news\)/);
    expect(DEPLOY_WORKFLOW).toMatch(/content-less build/);
  });

  it("smoke-tests for a team link, not for the word dragons", () => {
    expect(DEPLOY_WORKFLOW).not.toMatch(/grep -qi dragons/);
    expect(DEPLOY_WORKFLOW).toContain(`grep -q 'href="/teams/'`);
  });

  it("publishes the release sha so the live release can be identified", () => {
    expect(DEPLOY_WORKFLOW).toMatch(/release\.txt/);
  });

  it("rolls back automatically when the smoke test fails", () => {
    expect(DEPLOY_WORKFLOW).toMatch(
      /if: failure\(\) && steps\.smoke\.outcome == 'failure' && steps\.live\.outputs\.sha != ''/,
    );
  });
});
