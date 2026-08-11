import { describe, expect, it } from "vitest";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";

/** A message catalog: nested groups of strings, plus a few string lists. */
type Bundle = { [key: string]: string | string[] | Bundle };

/** Every leaf path in a bundle, list entries indexed as `group.key.0`. */
function flatKeys(bundle: Bundle, prefix = ""): string[] {
  return Object.entries(bundle).flatMap(([key, value]) => {
    if (typeof value === "string") return [prefix + key];
    if (Array.isArray(value)) return value.map((_, i) => `${prefix}${key}.${i}`);
    return flatKeys(value, `${prefix}${key}.`);
  });
}

const DE = flatKeys(de).sort();
const EN = flatKeys(en).sort();

describe("locale bundles", () => {
  it("carry the same keys in DE and EN", () => {
    expect(EN).toEqual(DE);
  });

  it("localize the Staff standings entry point in both languages", () => {
    expect(DE).toContain("home.viewStandings");
    expect(EN).toContain("home.viewStandings");
  });
});
