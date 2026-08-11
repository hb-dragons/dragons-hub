import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Structural navigation rules, asserted against the real source tree.
 *
 * Companion to `routes.test.ts`: that file keeps the deep-link gate honest
 * against the expo-router file tree, this one keeps *containment* honest —
 * which navigation APIs the app is allowed to reach for, and from where. Both
 * sit on the same seam (the files on disk), so a rule stated here fails the
 * build instead of being re-litigated in review.
 */

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGE_JSON = path.resolve(SRC_DIR, "../package.json");

/** Every non-test source file under `src/`, as repo-relative paths. */
function sourceFiles(dir: string = SRC_DIR): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.(test|d)\.tsx?$/.test(entry)) continue;
    found.push(full);
  }
  return found;
}

const SOURCE_FILES = sourceFiles();

/** Module specifiers a file imports, covering `import`, `export ... from` and `require`. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  const pattern = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]!);
  return specifiers;
}

/** Repo-relative path, so a failure message points at something clickable. */
const rel = (file: string): string => path.relative(path.resolve(SRC_DIR, ".."), file);

/** Files importing anything from `module` (exact match or a subpath of it). */
function importSites(module: string): string[] {
  return SOURCE_FILES.filter((file) =>
    importsOf(file).some((spec) => spec === module || spec.startsWith(`${module}/`)),
  ).map(rel);
}

describe("navigation architecture", () => {
  it("found the source tree", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(50);
  });

  // The SDK 56 router codemod folded React Navigation into expo-router. Reaching
  // for the upstream packages again would reintroduce a second copy of the
  // navigation core — the exact debt the fork exists to end.
  it("has no direct @react-navigation/* import left in app source", () => {
    expect(importSites("@react-navigation")).toEqual([]);
  });

  // ADR 0003 (#212): native tabs stay, contained. `unstable-native-tabs` is
  // alpha API and will churn; keeping it behind one wrapper makes that churn a
  // one-file fix rather than a sweep across every screen that names a tab.
  it("reaches the unstable native-tabs API from the AppTabs wrapper only", () => {
    expect(importSites("expo-router/unstable-native-tabs")).toEqual([
      "src/components/nav/AppTabs.tsx",
    ]);
  });

  // Issue #219: the board's utility sheets are system form sheets now. A
  // `@gorhom/bottom-sheet` import inside one would mean a JS sheet drawn
  // inside a native sheet — two sets of detents fighting over the same drag.
  it("draws no JS bottom sheet inside a sheet route", () => {
    const offenders = SOURCE_FILES.filter(
      (file) =>
        rel(file).startsWith("src/app/admin/boards/sheets/") &&
        importsOf(file).some((spec) => spec.startsWith("@gorhom/bottom-sheet")),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  // Result tokens are only safe while every registration is paired with a
  // release. Both halves of that pairing live in these two modules; a third
  // caller would be a leak waiting to happen.
  it("reaches the sheet-result table from the two modules that own it", () => {
    const sites = SOURCE_FILES.filter((file) =>
      importsOf(file).some((spec) => /(^|\/)sheet-result$/.test(spec)),
    ).map(rel);
    expect(sites.sort()).toEqual([
      "src/hooks/useSheetResult.ts",
      "src/lib/nav/board-sheets.ts",
    ]);
  });

  it("does not declare @react-navigation/* as a dependency", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(declared.filter((name) => name.startsWith("@react-navigation/"))).toEqual([]);
  });
});
