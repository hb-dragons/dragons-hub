import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOURCE_FILES, importSites, resolveInPackage } from "../../../test/source-tree";

/**
 * Structural navigation rules, asserted against the real source tree.
 *
 * Companion to `routes.test.ts`: that file keeps the deep-link gate honest
 * against the expo-router file tree, this one keeps *containment* honest —
 * which navigation APIs the app is allowed to reach for, and from where. Both
 * sit on the same seam (the files on disk), so a rule stated here fails the
 * build instead of being re-litigated in review.
 *
 * The tree-reading itself lives in `test/source-tree.ts`, shared with the
 * haptic call-site audit in `src/lib/haptics.test.ts` (#218).
 */

const PACKAGE_JSON = resolveInPackage("package.json");

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

  it("does not declare @react-navigation/* as a dependency", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(declared.filter((name) => name.startsWith("@react-navigation/"))).toEqual([]);
  });
});
