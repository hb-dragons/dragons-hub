import { describe, expect, it } from "vitest";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";

type Bundle = { [key: string]: string | Bundle };

function flatKeys(bundle: Bundle, prefix = ""): string[] {
  return Object.entries(bundle).flatMap(([key, value]) =>
    typeof value === "string"
      ? [prefix + key]
      : flatKeys(value, `${prefix}${key}.`),
  );
}

const DE = flatKeys(de as unknown as Bundle);
const EN = flatKeys(en as unknown as Bundle);

describe("locale bundles", () => {
  it("carry the same keys in DE and EN", () => {
    expect([...EN].sort()).toEqual([...DE].sort());
  });

  it("localize the Staff standings entry point in both languages", () => {
    expect(DE).toContain("home.viewStandings");
    expect(EN).toContain("home.viewStandings");
  });
});
