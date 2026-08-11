import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TAB_CONFIG } from "@/lib/nav/tabs";
import { SOURCE_FILES, importSites, rel, resolveInPackage } from "../../../test/source-tree";

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
const APP_DIR = resolveInPackage("src/app");
const TABS_DIR = path.join(APP_DIR, "(tabs)");

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

  // #216: native tabs draw no chrome of their own, so a tab root only gets a
  // collapsing large title if it sits in a stack. Home is the deliberate
  // exception — it keeps its chrome-less wordmark layout.
  it("gives every tab root but Home a stack to hang a native header on", () => {
    for (const { name } of Object.values(TAB_CONFIG)) {
      const layout = path.join(TABS_DIR, name, "_layout.tsx");
      expect(existsSync(layout), `${rel(layout)} is missing`).toBe(name !== "index");
    }
  });

  it("has no numeric header offset left compensating for a header", () => {
    // The native header insets its own content; `Screen`'s
    // `UNDER_NATIVE_HEADER` edges opt the scroll view into that inset (see
    // lib/ui/scroll-inset.ts) instead of padding past a guessed header height.
    expect(SOURCE_FILES.filter((f) => readFileSync(f, "utf8").includes("headerOffset")).map(rel))
      .toEqual([]);
  });

  it("hides back titles with the display mode, not a zero font size", () => {
    expect(
      SOURCE_FILES.filter((f) => /headerBackTitle(Style)?\b/.test(readFileSync(f, "utf8"))).map(rel),
    ).toEqual([]);
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

/** Route files that render a screen, i.e. everything under `app/` bar the layouts. */
const SCREEN_FILES = SOURCE_FILES.filter(
  (file) => file.startsWith(APP_DIR + path.sep) && path.basename(file) !== "_layout.tsx",
);

describe("native header declarations", () => {
  it("found the screen files", () => {
    expect(SCREEN_FILES.length).toBeGreaterThan(5);
  });

  // #216. A screen's static header options belong in its layout; what is left
  // inline is the part that depends on the screen's own data, and there is
  // only ever one of those.
  it("declares at most one <Stack.Screen> per screen", () => {
    for (const file of SCREEN_FILES) {
      const declarations = readFileSync(file, "utf8").match(/<Stack\.Screen\b/g) ?? [];
      expect(declarations.length, `${rel(file)} declares header options twice`)
        .toBeLessThanOrEqual(1);
    }
  });

  // Attaching header options only once the data arrives reconfigures the
  // native header mid push-transition, which flashes a header overlay (the
  // note in app/admin/boards/[id].tsx records where that was first seen). The
  // declaration therefore has to be reachable before any state branch returns.
  //
  // Textual and therefore approximate: it catches a header declared inside a
  // late branch, not one built early and then dropped from a branch. At most
  // one `return (` may precede the declaration — the very return that renders
  // it. A second one is a loading or error state that ships no header.
  it("declares header options ahead of every state branch", () => {
    for (const file of SCREEN_FILES) {
      const body = componentBody(readFileSync(file, "utf8"));
      const header = body.indexOf("<Stack.Screen");
      if (header === -1) continue;
      const returnsBefore = body.slice(0, header).match(/return \(/g) ?? [];
      expect(returnsBefore.length, `${rel(file)} returns before it declares header options`)
        .toBeLessThanOrEqual(1);
    }
  });
});

describe("scroll containers", () => {
  // A VirtualizedList inside a ScrollView renders every row eagerly (it never
  // sees a viewport) and RN warns about it. It also hides the list from the
  // native header: react-native-screens looks for the screen's scroll view by
  // walking the *first* child of each view down from the screen, so the outer
  // ScrollView is what a large title would track instead.
  it("never puts a virtualized list inside Screen's own ScrollView", () => {
    for (const file of SCREEN_FILES) {
      const source = readFileSync(file, "utf8");
      if (!/<(FlatList|SectionList)\b/.test(source) || !source.includes("<Screen")) continue;
      expect(source, `${rel(file)} nests a virtualized list in a scrolling Screen`)
        .toContain("scroll={false}");
    }
  });

  // `Screen` opts its *own* ScrollView into the native header's content inset.
  // A screen that brought its own list instead has to say so on that list, or
  // the content starts under the header and the large title never collapses.
  // RN defaults the behaviour to "never", so leaving it out is not neutral.
  it("opts a screen's own list into the native header's content inset", () => {
    for (const file of SCREEN_FILES) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("UNDER_NATIVE_HEADER") || !source.includes("scroll={false}")) continue;
      if (!/<(FlatList|SectionList)\b/.test(source)) continue;
      expect(source, `${rel(file)}'s list ignores the native content inset`)
        .toContain('contentInsetAdjustmentBehavior="automatic"');
    }
  });
});

/**
 * The body of a file's default-exported component, so a rule about a screen is
 * not tripped by a helper declared below it.
 */
function componentBody(source: string): string {
  const start = source.indexOf("export default function");
  if (start === -1) return "";
  const end = source.indexOf("\n}", start);
  return source.slice(start, end === -1 ? undefined : end);
}
