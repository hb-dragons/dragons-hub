import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from disk resolved against this file, not the cwd: vitest stubs CSS
// imports — `?raw` included — to empty strings.
const globalsCss = readFileSync(new URL("globals.css", import.meta.url), "utf8");
const siteCss = readFileSync(new URL("site.css", import.meta.url), "utf8");

/**
 * Name-parity guard between the admin theme (globals.css) and the public-site
 * theme (site.css). The two files carry different values on purpose — they are
 * different looks — but they must define exactly the same custom-property
 * vocabulary, block for block. A name that exists in only one file is a fork:
 * a component styled against the missing name renders with a silent fallback
 * on one surface and nobody sees it fail.
 */

/**
 * The themed blocks share a flat shape (declarations only, no nested braces),
 * so a bracket-free brace match is enough — no CSS parser needed. All
 * occurrences are concatenated so a second block of the same selector cannot
 * smuggle names past the comparison.
 */
function blockContent(css: string, blockPattern: RegExp, label: string): string {
  const matches = [...css.matchAll(blockPattern)];
  if (matches.length === 0) {
    throw new Error(`No ${label} block found`);
  }
  return matches.map((match) => match[1]).join("\n");
}

/** Declared custom-property names (`--foo:`), deduplicated and sorted. */
function propertyNames(block: string): string[] {
  return [...new Set(block.match(/--[\w-]+(?=\s*:)/g) ?? [])].sort();
}

const blocks = [
  { label: ":root", pattern: /:root\s*\{([^}]*)\}/g },
  { label: ".dark", pattern: /\.dark\s*\{([^}]*)\}/g },
  { label: "@theme inline", pattern: /@theme inline\s*\{([^}]*)\}/g },
] as const;

describe("site.css name parity with globals.css", () => {
  it.each(blocks)(
    "$label defines exactly the custom properties globals.css defines",
    ({ label, pattern }) => {
      const adminNames = propertyNames(blockContent(globalsCss, pattern, label));
      const siteNames = propertyNames(blockContent(siteCss, pattern, label));

      expect(siteNames).toEqual(adminNames);
    },
  );
});
