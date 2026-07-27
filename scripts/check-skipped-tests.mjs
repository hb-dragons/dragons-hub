/**
 * Fail the build on a skipped test that nobody is accountable for.
 *
 * A skipped test is worse than a missing one: it still shows up in the file
 * listing, contributes nothing to coverage, and carries no record of why it is
 * off or what would turn it back on. Issue #132 found two such files in
 * apps/web. Both blamed an upstream Radix bug that the vitest config had
 * already patched around; the real causes were a `waitFor` under fake timers
 * and a test mock that returned a fresh object per render. Both were fixable
 * in minutes once someone looked — which nobody had, because nothing made
 * them.
 *
 * The rule: every skip marker must carry an issue reference (`#123`, or a full
 * GitHub issue URL) so the skip is attached to something someone can close.
 * The reference may sit
 *   - on the skip line itself (including inside the test name),
 *   - anywhere in the contiguous comment block directly above it, or
 *   - within the 3 lines directly below it (multi-line call, reason argument).
 *
 * Usage:
 *   node scripts/check-skipped-tests.mjs [path ...]
 * With no arguments it scans the repository from the current directory.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

const ignoredDirs = new Set([
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

/**
 * Same rule as check-ai-slop.mjs: dot-directories are build/tool state, not
 * source. Skipping them also keeps a repo-root run out of `.claude/worktrees`,
 * where sibling agent checkouts of this same repo live.
 */
function isIgnoredDir(name) {
  if (name.startsWith(".")) return true;
  return ignoredDirs.has(name);
}

const JS_TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;
const PY_TEST_FILE = /^(?:test_.*\.py|.*_test\.py|conftest\.py)$/;

/**
 * Skip markers, per language. Kept deliberately narrow — anchored on the test
 * globals — so an unrelated `.skip()` on an array or a parser stays quiet.
 */
const JS_SKIP_MARKERS = [
  // describe.skip / it.todo / test.concurrent.skip / bench.skipIf ...
  /\b(?:describe|it|test|suite|bench)(?:\.[A-Za-z]+)*\.(?:skip|todo|skipIf)\b/,
  // Jasmine-style disabled blocks.
  /\b(?:xdescribe|xit|xtest)\s*\(/,
];
const PY_SKIP_MARKERS = [
  /@pytest\.mark\.(?:skip|skipif|xfail)\b/,
  /\bpytest\.skip\s*\(/,
];

const ISSUE_REFERENCE =
  /(?:#\d+|https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)/;

const JS_COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
const PY_COMMENT_LINE = /^\s*#/;

const LOOKAHEAD_LINES = 3;

/** @type {{file: string, line: number, text: string}[]} */
const findings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) continue;
      await walk(fullPath);
      continue;
    }

    await checkFile(fullPath);
  }
}

async function checkFile(filePath) {
  const name = path.basename(filePath);
  const isPython = PY_TEST_FILE.test(name);
  const isJs = JS_TEST_FILE.test(name);
  if (!isPython && !isJs) return;

  const markers = isPython ? PY_SKIP_MARKERS : JS_SKIP_MARKERS;
  const commentLine = isPython ? PY_COMMENT_LINE : JS_COMMENT_LINE;

  const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!markers.some((marker) => marker.test(line))) continue;
    if (isAnnotated(lines, i, commentLine)) continue;

    findings.push({
      file: path.relative(rootDir, filePath),
      line: i + 1,
      text: line.trim(),
    });
  }
}

/** Does this skip carry an issue reference nearby? */
function isAnnotated(lines, index, commentLine) {
  if (ISSUE_REFERENCE.test(lines[index])) return true;

  // The contiguous comment block directly above.
  for (let i = index - 1; i >= 0 && commentLine.test(lines[i]); i -= 1) {
    if (ISSUE_REFERENCE.test(lines[i])) return true;
  }

  // A few lines below, for a reason string on its own line.
  const end = Math.min(lines.length, index + 1 + LOOKAHEAD_LINES);
  for (let i = index + 1; i < end; i += 1) {
    if (ISSUE_REFERENCE.test(lines[i])) return true;
  }

  return false;
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  await walk(rootDir);
} else {
  for (const target of targets) {
    const resolved = path.resolve(target);
    if ((await stat(resolved)).isDirectory()) await walk(resolved);
    else await checkFile(resolved);
  }
}

if (findings.length > 0) {
  console.error(
    "Skipped-test check failed. Every skipped or todo test needs an issue\n" +
      "reference (e.g. `#132`) on the skip line, in the comment block above it,\n" +
      "or in the 3 lines below it — otherwise fix the test or delete it:",
  );

  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}`);
    console.error(`  ${finding.text}`);
  }

  process.exit(1);
}

console.log("Skipped-test check passed.");
