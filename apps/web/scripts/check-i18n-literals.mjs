#!/usr/bin/env node
// CLI wrapper around `scanSourceForLiterals` (see i18n-literal-scan.core.mjs
// for why this exists). Walks `src/`, flags any file with a hardcoded
// user-facing literal, and fails only on files NOT already listed in
// `i18n-literal-baseline.json`.
//
// The baseline is a ratchet, same shape as the coverage thresholds in
// CLAUDE.md: it grandfathers in pre-existing debt so this check can be
// switched on without a stop-the-world rewrite, but it only ever shrinks.
// A file drops out of the baseline once someone cleans it up; if a
// baselined file goes on to show zero violations, this script fails and
// tells you to remove it — an already-fixed file silently staying on the
// baseline would let a new hardcoded string slip back in unnoticed.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSourceForLiterals } from "./i18n-literal-scan.core.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptsDir, "..");
const srcDir = path.join(webRoot, "src");
const baselinePath = path.join(scriptsDir, "i18n-literal-baseline.json");

const IGNORED_TOP_LEVEL_DIRS = new Set(["messages", "i18n"]);
const IGNORED_DIR_NAMES = new Set(["node_modules", "__mocks__"]);

async function collectFiles(dir, isTopLevel = true) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (isTopLevel && IGNORED_TOP_LEVEL_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
      files.push(...(await collectFiles(path.join(dir, entry.name), false)));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.d\.ts$/.test(entry.name)) continue;

    files.push(path.join(dir, entry.name));
  }

  return files;
}

const files = await collectFiles(srcDir);
const baselineRaw = await readFile(baselinePath, "utf8");
const baseline = new Set(JSON.parse(baselineRaw));

const offendersByFile = new Map();

for (const file of files) {
  const relFile = path.relative(webRoot, file);
  const content = await readFile(file, "utf8");
  const violations = scanSourceForLiterals(content, file);
  if (violations.length > 0) {
    offendersByFile.set(relFile, violations);
  }
}

const newOffenders = [...offendersByFile.entries()].filter(([relFile]) => !baseline.has(relFile));
const staleBaselineEntries = [...baseline].filter((relFile) => !offendersByFile.has(relFile));

let failed = false;

if (newOffenders.length > 0) {
  failed = true;
  console.error(
    "i18n literal check failed: hardcoded user-facing text found in JSX or an " +
      "allowlisted call argument (see USER_FACING_CALL_RULES in scripts/i18n-literal-scan.core.mjs).\n" +
      "Move these strings into src/messages/{en,de}.json and read them via useTranslations/getTranslations.\n",
  );
  for (const [relFile, violations] of newOffenders) {
    console.error(`${relFile}`);
    for (const v of violations.slice(0, 10)) {
      console.error(`  ${relFile}:${v.line}:${v.column} [${v.kind}] "${v.text}"`);
    }
    if (violations.length > 10) {
      console.error(`  … and ${violations.length - 10} more`);
    }
  }
  console.error(
    "\nIf this is pre-existing debt outside your change's scope, add the file path to " +
      "apps/web/scripts/i18n-literal-baseline.json instead of fixing it here.",
  );
}

if (staleBaselineEntries.length > 0) {
  failed = true;
  console.error(
    "\ni18n literal check failed: these baseline entries no longer have any violations. " +
      "Remove them from apps/web/scripts/i18n-literal-baseline.json (the baseline only shrinks):",
  );
  for (const relFile of staleBaselineEntries) {
    console.error(`  ${relFile}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `i18n literal check passed. ${offendersByFile.size} file(s) on the baseline, 0 new offenders.`,
);
