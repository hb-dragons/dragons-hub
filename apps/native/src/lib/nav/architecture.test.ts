import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TAB_CONFIG } from "@/lib/nav/tabs";
import {
  SOURCE_FILES,
  importSites,
  importsOf,
  rel,
  resolveInPackage,
  valueImportSites,
} from "../../../test/source-tree";

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

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** The app's own `package.json`, for the rules about what it declares. */
function readManifest(): PackageManifest {
  return JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as PackageManifest;
}

/** Every package the app declares, runtime and dev alike. */
function declaredPackages(): string[] {
  const manifest = readManifest();
  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
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

  /**
   * Issue #225, the contract step: there is no JS bottom-sheet layer left.
   *
   * Every sheet the app has is a route with a native presentation (#219, #222,
   * #223) and every long-press menu is a first-party one (#220), so the
   * library, the provider it needed at the root, and the last panel drawn with
   * it are all gone. Stated in both places it can come back from: an import
   * anywhere in `src/`, and the manifest — a dependency left declared is what
   * makes such an import resolve, and it ships the native module into the
   * binary whether anything renders it or not.
   *
   * What the rule is protecting, in the order the reasons were found:
   *  - a JS sheet inside a route sheet is two sets of detents fighting over one
   *    drag (#219);
   *  - a `BottomSheetTextInput` inside a *native* sheet registers with a JS
   *    sheet that is not on screen, so it stops lifting for the keyboard
   *    (#222).
   */
  it("has no JS bottom sheet layer left, in source or in the manifest", () => {
    expect(importSites("@gorhom/bottom-sheet")).toEqual([]);
    expect(declaredPackages()).not.toContain("@gorhom/bottom-sheet");
  });

  // Issue #220, ADR 0002: item-level actions belong behind a real context
  // menu. `ActionSheetIOS` was the sanctioned interim while there was no
  // first-party menu in the app; there is one now (`TaskContextMenu`), so the
  // sanctioned set is empty and an action sheet reappearing is a regression to
  // the pattern the ADR replaced.
  it("reaches for no action sheet, on either platform", () => {
    const offenders = SOURCE_FILES.filter((file) =>
      reactNativeImports(readFileSync(file, "utf8")).includes("ActionSheetIOS"),
    ).map(rel);

    expect(offenders).toEqual([]);
    expect(importSites("@expo/react-native-action-sheet")).toEqual([]);
  });

  // The other half of "one implementation serves both platforms": the menu is
  // declared in one component, so a second surface wanting task actions asks
  // that component for them rather than growing its own list.
  it("declares the native link menu in one component", () => {
    const sites = SOURCE_FILES.filter((file) =>
      /<Link\.(Menu|Preview)\b/.test(readFileSync(file, "utf8")),
    ).map(rel);

    expect(sites).toEqual(["src/components/board/TaskContextMenu.tsx"]);
  });

  /**
   * Issue #224. A header button is a bar button item, not a view hosted in the
   * bar.
   *
   * `headerRight` hands react-native-screens a React element to mount inside
   * the navigation bar: the app then owns the tap target, the tint, the
   * spacing and the pressed state, and on iOS 26 the item sits *on* the bar's
   * glass rather than in it. `Stack.Toolbar` items are `UIBarButtonItem`s, so
   * all of that comes from UIKit. Stated as an absence, because the render
   * prop is what a screen reaches for by habit.
   */
  it("puts header buttons in the bar, not a view hosted inside it", () => {
    // Matched where the option is *set* — `headerRight:` in an options object,
    // `headerRight=` on a component — so the prose above and the notes in the
    // screens that stopped using it do not read as offenders.
    const offenders = SOURCE_FILES.filter((file) =>
      /\bheader(Right|Left)\s*[:=]/.test(readFileSync(file, "utf8")),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  /**
   * The other half of #224: what did not fit in the bar is a `UIMenu`, not one
   * more button opening one more sheet — and the bar itself is declared in one
   * component, the same containment `TaskContextMenu` has for item menus.
   *
   * The containment is what makes the Android tier possible at all:
   * `Stack.Toolbar`'s items take an SF Symbol name on iOS and an image source
   * on Android, and render nothing there when handed the former, so exactly
   * one module knows that and hosts plain pressables instead.
   */
  it("declares the navigation bar's items in one component", () => {
    const sites = SOURCE_FILES.filter((file) =>
      /<Stack\.Toolbar\b/.test(readFileSync(file, "utf8")),
    ).map(rel);
    expect(sites).toEqual(["src/components/nav/HeaderActions.tsx"]);
  });

  // #224: Profile's theme and language switchers were rows of tinted
  // `Pressable`s. They are the same `UISegmentedControl` the Schedule and
  // Officiating tabs use now, and the wrapper is the only importer of it — the
  // containment that stops a screen re-deriving the selected treatment.
  it("draws every segmented control through the one wrapper", () => {
    expect(importSites("@react-native-segmented-control/segmented-control")).toEqual([
      "src/components/ui/Segmented.tsx",
    ]);
  });

  // Issue #223: the referee-assignment picker was the app's last React Native
  // `<Modal>` — a JS-drawn `pageSheet` that had to bring its own header, close
  // button and keyboard handling. Every modal surface is a route with a native
  // presentation now, so the system draws the sheet and nothing imitates it.
  it("presents modal surfaces as routes, not through React Native's Modal", () => {
    const offenders = SOURCE_FILES.filter((file) =>
      reactNativeImports(readFileSync(file, "utf8")).includes("Modal"),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  // The same sheet translated its content by the keyboard height on every
  // frame. A native header search field needs none of that, and the four
  // sites left are content-layer components that legitimately do: the
  // provider, a sign-in form, the assistant's composer, and the scrolling
  // sheet body that lifts a focused field clear of the keyboard (#222).
  it("leaves keyboard management to the system outside the content layer", () => {
    expect(importSites("react-native-keyboard-controller")).toEqual([
      "src/app/(auth)/sign-in.tsx",
      "src/app/_layout.tsx",
      "src/app/assistant.tsx",
      "src/components/sheets/SheetScreen.tsx",
    ]);
  });

  // Result tokens are only safe while every registration is paired with a
  // release. Both halves of that pairing live in these two modules; a third
  // caller would be a leak waiting to happen.
  it("reaches the sheet-result table from the two modules that own it", () => {
    const sites = SOURCE_FILES.filter((file) =>
      importsOf(file).some((spec) => /(^|\/)sheet-result$/.test(spec)),
    ).map(rel);
    expect(sites.sort()).toEqual(["src/hooks/useSheetResult.ts", "src/lib/nav/board-sheets.ts"]);
  });

  it("does not declare @react-navigation/* as a dependency", () => {
    expect(declaredPackages().filter((name) => name.startsWith("@react-navigation/"))).toEqual([]);
  });

  // #221: symbols arrive through expo-router's native tabs either way, but the
  // rest of the chrome needs the package itself. Declaring it directly also
  // pins it: an Expo SDK package has to match the SDK's major or it links
  // against a different native runtime than the one the app builds.
  it("declares expo-symbols directly, at the SDK's major", () => {
    const { dependencies = {} } = readManifest();
    const sdkMajor = /^~?(\d+)\./.exec(dependencies.expo ?? "")?.[1];
    expect(sdkMajor, "cannot read the Expo SDK major from the expo dependency").toBeTruthy();
    expect(dependencies["expo-symbols"]).toMatch(new RegExp(`^~${sdkMajor}\\.`));
  });

  // expo-symbols is beta and says so on its own docs page; the spec (#212)
  // accepted that deliberately. The containment is the same shape as ADR 0003's
  // for native tabs: one wrapper renders `SymbolView`, everything else names a
  // role from `lib/ui/icons.ts`, so a breaking change to the component is a
  // one-file fix. The registry names the same package for its symbol *types*,
  // which erase at build time and cannot break at runtime.
  it("renders the beta SymbolView from the Icon wrapper only", () => {
    expect(valueImportSites("expo-symbols")).toEqual(["src/components/ui/Icon.tsx"]);
    expect(importSites("expo-symbols")).toEqual([
      "src/components/ui/Icon.tsx",
      // Type-only, both of them: the icon registry's two symbol catalogues,
      // and the SF Symbol names the task menu hands to UIKit (#220).
      "src/lib/board/task-actions.ts",
      "src/lib/ui/icons.ts",
    ]);
  });
});

describe("icon language", () => {
  /**
   * Characters the app used to draw as icons: a sort control, an overflow
   * button, a close button, a tick, a warning. Typed into a `<Text>` they take
   * the text font's shape and weight, land at whatever baseline the font
   * decides, and look like a keyboard character next to a real symbol.
   */
  const GLYPH_ICONS = ["⇅", "⋯", "×", "✕", "✓", "✔", "⚠", "›", "‹", "▾", "▸"];

  it("draws no icon as a literal glyph", () => {
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      const found = GLYPH_ICONS.filter((glyph) => source.includes(glyph));
      expect(found, `${rel(file)} draws an icon as a text glyph`).toEqual([]);
    }
  });

  // "+" is a legitimate character in source (arithmetic, string joins), so this
  // one is scoped to a JSX text node that holds nothing else — which is only
  // ever an add button.
  it("draws no add button as a bare plus", () => {
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      expect(/>\s*\+\s*</.test(source), `${rel(file)} draws an add button as a text glyph`)
        .toBe(false);
    }
  });

  // A glyph hides just as well inside a translation as inside JSX: two labels
  // read "+ Add card" and "+ New column" until #221, which is the same button
  // with the same keyboard character, only spelled in a place a reviewer looks
  // at less often. The symbol goes beside the label; the label is words.
  it("puts no icon glyph in a translated label", () => {
    const localeDir = resolveInPackage("src/i18n");
    for (const file of readdirSync(localeDir).filter((name) => name.endsWith(".json"))) {
      const strings = JSON.parse(readFileSync(path.join(localeDir, file), "utf8")) as object;
      for (const [key, value] of flatten(strings)) {
        const found = GLYPH_ICONS.filter((glyph) => value.includes(glyph));
        expect(found, `${file}: ${key} draws an icon in a label`).toEqual([]);
        expect(/^\+/.test(value), `${file}: ${key} draws an icon in a label`).toBe(false);
      }
    }
  });

  // The brand assets are drawings, not icons: no symbol catalogue has the
  // Dragons logo. Everything else that used to be a hand-drawn path — the
  // send arrow, the task card's meta icons, the referee search field — is a
  // symbol now, so `react-native-svg` is reached through the two brand
  // components and the `*.svg` imports they make.
  it("keeps SVG for the brand assets only", () => {
    expect(importSites("react-native-svg")).toEqual([]);
    const svgAssets = SOURCE_FILES.filter((file) =>
      importsOf(file).some((spec) => spec.endsWith(".svg")),
    ).map(rel);
    expect(svgAssets).toEqual([
      "src/components/brand/Logo.tsx",
      "src/components/brand/Wordmark.tsx",
    ]);
  });
});

/** Every `key.path -> string` pair in a nested translation file. */
function flatten(node: object, prefix = ""): [string, string][] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? flatten(value as object, `${prefix}${key}.`)
      : [[`${prefix}${key}`, String(value)] as [string, string]],
  );
}

/** The names a file imports from `react-native`, across a multi-line import. */
function reactNativeImports(source: string): string[] {
  // `[^}]` rather than a lazy `[\s\S]`: the lazy form happily starts at an
  // earlier import's brace and swallows everything up to this one's closer,
  // which turns every name in between into one unsplittable blob.
  const clauses = source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']react-native["']/g);
  return [...clauses].flatMap((match) =>
    match[1]!.split(",").map((name) => name.trim().split(/\s+as\s+/)[0]!.trim()),
  );
}

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
  // `<HeaderActions>` counts too (#224): its bar items compose into the same
  // native header options, so a bar declared in a late branch flashes for
  // exactly the same reason.
  //
  // Textual and therefore approximate: it catches a header declared inside a
  // late branch, not one built early and then dropped from a branch. At most
  // one `return (` may precede the declaration — the very return that renders
  // it. A second one is a loading or error state that ships no header.
  it.each(["<Stack.Screen", "<HeaderActions"])("declares %s ahead of every state branch", (tag) => {
    for (const file of SCREEN_FILES) {
      const preamble = declaringComponentPreamble(readFileSync(file, "utf8"), tag);
      if (preamble === null) continue;
      const returnsBefore = preamble.match(/return \(/g) ?? [];
      expect(returnsBefore.length, `${rel(file)} returns before it declares ${tag}`)
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
 * Everything between the start of the component that declares `tag` and the
 * `tag` itself, or `null` if the file never declares it.
 *
 * Measured from the *declaring* component rather than from the default export:
 * a screen may export a one-line wrapper around the component that renders the
 * header, which `app/admin/boards/[id].tsx` does, and reading only the export
 * would make the rule above vacuous for exactly the screen whose flash it
 * records. The enclosing component is the last top-level `function` opened
 * before the tag, so a helper declared *below* the component still cannot trip
 * the rule.
 */
function declaringComponentPreamble(source: string, tag: string): string | null {
  const tagAt = source.indexOf(tag);
  if (tagAt === -1) return null;
  const declarations = [
    ...source.slice(0, tagAt).matchAll(/^(?:export (?:default )?)?function /gm),
  ];
  return source.slice(declarations.at(-1)?.index ?? 0, tagAt);
}
