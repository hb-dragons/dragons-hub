import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCE_FILES, rel, resolveInPackage } from "../../test/source-tree";

/**
 * Text accessibility rules (#397), asserted against the source tree: the
 * parts of Dynamic Type, Bold Text and VoiceOver support that live in where
 * code reaches for something rather than in a function a test can call.
 */

const read = (relativePath: string): string =>
  readFileSync(resolveInPackage(relativePath), "utf8");

/** Named imports a file takes from the given module specifiers. */
function namedImportsFrom(source: string, modulePattern: RegExp): string[] {
  const statement = /import\s+(?!type\s)\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  const names: string[] = [];
  for (const [, list, spec] of source.matchAll(statement)) {
    if (!modulePattern.test(spec!)) continue;
    for (const raw of list!.split(",")) {
      const name = raw.trim().replace(/^type\s+/, "");
      if (name && !raw.trim().startsWith("type ")) names.push(name.split(/\s+as\s+/)[0]!);
    }
  }
  return names;
}

const TYPOGRAPHY_MODULE = /(^|\/)theme\/(typography|font-families)$/;

describe("text accessibility", () => {
  it("found the source tree", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(50);
  });

  // VoiceOver's rotor lists headings from `accessibilityRole="header"`; with
  // no roles the Headings setting has nothing to jump between.
  it("announces the shared section header as a heading", () => {
    const source = read("src/components/SectionHeader.tsx");
    expect(source).toMatch(/<Text[^>]*accessibilityRole="header"[^>]*>\s*\{title\}/);
  });

  // Bold Text swaps families inside the theme (theme/bold-text.ts). A screen
  // importing the static tables would render the regular face whatever the
  // setting says, so content takes its families and text styles from
  // `useTheme()`. Navigation chrome (components/nav) is exempt: the bar items
  // there are sized to the bar, not to content.
  it("takes font families and text styles from the theme, not the static tables", () => {
    const allowed = (file: string): boolean =>
      file.startsWith("src/theme/") ||
      file === "src/hooks/useTheme.tsx" ||
      file.startsWith("src/components/nav/");
    const offenders = SOURCE_FILES.map((file) => ({
      file: rel(file),
      names: namedImportsFrom(readFileSync(file, "utf8"), TYPOGRAPHY_MODULE).filter(
        (name) => name === "fontFamilies" || name === "textStyles",
      ),
    }))
      .filter(({ file, names }) => names.length > 0 && !allowed(file))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  // Scoreboard digits and table headers sit in slots that cannot grow, so
  // each use carries a `maxFontSizeMultiplier`; body and captions never do.
  it("caps every scoreboard digit and table header it renders", () => {
    const capped = /textStyles\.(score|stat|tableHeader)\b/g;
    const missing = SOURCE_FILES.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const uses = source.match(capped)?.length ?? 0;
      const caps = source.match(/maxFontSizeMultiplier=/g)?.length ?? 0;
      return uses > caps ? [`${rel(file)}: ${uses} capped styles, ${caps} caps`] : [];
    });
    expect(missing).toEqual([]);
  });

  it("never caps body or caption text", () => {
    const offenders = SOURCE_FILES.filter((file) =>
      /maxFontSizeMultiplier=\{maxFontSizeMultiplierFor\("(body|caption)"\)\}/.test(
        readFileSync(file, "utf8"),
      ),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  // Fixed column widths clip digits at the accessibility sizes; the tables use
  // minimum widths and a stacked layout above the threshold instead.
  it.each(["src/components/StandingsTable.tsx", "src/components/QuarterTable.tsx"])(
    "%s has no fixed column width and stacks at large text sizes",
    (file) => {
      const source = read(file);
      expect(source).not.toMatch(/\bwidth: \d+/);
      expect(source).toMatch(/tableLayoutFor\(/);
    },
  );

  // Apple's default body size is 17 pt; the design system keeps 15 to match
  // the web (DESIGN-SYSTEM.md, "Native typography"). Changing it is a design
  // decision, not an accessibility fix, so it does not drift silently.
  it("keeps body at 15 pt", () => {
    const typography = read(path.join("src", "theme", "typography.ts"));
    expect(typography).toMatch(/body: \{\s*fontFamily: fontFamilies\.body,\s*fontSize: 15,/);
  });
});
