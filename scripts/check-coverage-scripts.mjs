import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  "coverage",
  ".expo",
  ".turbo",
]);

/**
 * Workspace packages that ship TypeScript source but deliberately have no test
 * suite of their own. Every entry needs a reason that says why testing the
 * package here would not add signal, and what covers it instead. Delete the
 * entry the moment the package grows a test — the check below fails on a stale
 * exemption so this list cannot quietly outlive its justification.
 *
 * Recorded 2026-07-26 (issue #109). These are exemptions from the *no tests at
 * all* check only; none of them is exempt from being tested later, and each has
 * a follow-up noted in the issue.
 *
 * Precedent: @dragons/ui came off the list on 2026-07-27 (issue #131) — its
 * exemption claimed the package was vendored shadcn/Radix re-exported
 * unmodified, which the git history contradicts (sidebar.tsx carries cookie
 * persistence, a Cmd/Ctrl+B shortcut and a split mobile/desktop state, and
 * combobox/date-picker/time-picker are local compositions). It now has a
 * vitest harness scoped to that hand-written behaviour.
 */
const UNTESTED_PACKAGE_EXEMPTIONS = {
  // @dragons/site came off the list on 2026-08-01 (issue #172): the payload
  // content loader landed test-first, giving the package a vitest harness.
};

function walk(dir, visit) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, visit);
    } else {
      visit(entry, full);
    }
  }
}

function scan(dir) {
  let hasTest = false;
  let hasSource = false;
  walk(dir, (name) => {
    if (/\.test\.(ts|tsx)$/.test(name)) hasTest = true;
    else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) hasSource = true;
  });
  return { hasTest, hasSource };
}

const missingCoverageScript = [];
const untested = [];
const staleExemptions = [];
const seenPackages = new Set();

for (const root of ROOTS) {
  if (!existsSync(root)) continue;
  for (const pkg of readdirSync(root)) {
    const pkgDir = join(root, pkg);
    const pkgJsonPath = join(pkgDir, "package.json");
    const srcDir = join(pkgDir, "src");
    if (!existsSync(pkgJsonPath)) continue;
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const name = pkgJson.name ?? pkgDir;
    seenPackages.add(name);

    const { hasTest, hasSource } = scan(existsSync(srcDir) ? srcDir : pkgDir);
    const exemptionReason = UNTESTED_PACKAGE_EXEMPTIONS[name];

    if (hasTest) {
      if (!pkgJson.scripts?.coverage) missingCoverageScript.push(name);
      if (exemptionReason) staleExemptions.push(name);
      continue;
    }

    if (hasSource && !exemptionReason) untested.push(name);
  }
}

for (const name of Object.keys(UNTESTED_PACKAGE_EXEMPTIONS)) {
  if (!seenPackages.has(name)) staleExemptions.push(name);
}

const failures = [];
if (missingCoverageScript.length > 0) {
  failures.push(
    "These packages have *.test.* files but no `coverage` script:\n  " +
      missingCoverageScript.join("\n  "),
  );
}
if (untested.length > 0) {
  failures.push(
    "These packages ship TypeScript source but have no *.test.* files at all.\n" +
      "Add tests, or add an entry with a recorded reason to UNTESTED_PACKAGE_EXEMPTIONS\n" +
      "in scripts/check-coverage-scripts.mjs:\n  " +
      untested.join("\n  "),
  );
}
if (staleExemptions.length > 0) {
  failures.push(
    "These packages are listed in UNTESTED_PACKAGE_EXEMPTIONS but no longer qualify\n" +
      "(they now have tests, or no longer exist). Remove the exemption:\n  " +
      staleExemptions.join("\n  "),
  );
}

if (failures.length > 0) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log("Coverage-script check passed.");
