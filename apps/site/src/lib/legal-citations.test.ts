import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Issue #242: the TMG was repealed on 2024-05-14 (§ 5 TMG became § 5 DDG) and
// the MStV was renumbered (§ 55 Abs. 2 became § 18 Abs. 2). The legal pages
// are hand-written Astro outside any type system, so this test reads them from
// disk the way docs-drift.test.ts reads AGENTS.md, and fails when a repealed
// statute creeps back in or the section numbering breaks.

const SRC = fileURLToPath(new URL("..", import.meta.url));
const IMPRESSUM = readFileSync(join(SRC, "pages/impressum/index.astro"), "utf8");
const STRINGS = readFileSync(join(SRC, "lib/strings.ts"), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("legal citations", () => {
  it("cites the repealed TMG nowhere in src", () => {
    const offenders = walk(SRC)
      .filter((file) => /\.(astro|ts|tsx)$/.test(file) && !file.endsWith(".test.ts"))
      .filter((file) => /\bTMG\b/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(SRC.length));
    expect(offenders).toEqual([]);
  });

  it("opens the Impressum with § 5 DDG and § 18 Abs. 2 MStV", () => {
    expect(IMPRESSUM).toContain("§ 5 DDG");
    expect(IMPRESSUM).toContain("§ 18 Abs. 2 MStV");
  });

  it("rests the liability section on the Digital Services Act", () => {
    expect(IMPRESSUM).toMatch(/Verordnung \(EU\) 2022\/2065/);
  });

  it("names § 5 DDG in the Impressum SEO description", () => {
    expect(STRINGS).toContain("gemäß § 5 DDG");
  });

  it("numbers the Impressum sections contiguously from 1", () => {
    const numbers = [...IMPRESSUM.matchAll(/<h2[^>]*>(\d+)\. /g)].map((m) => Number(m[1]));
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });
});
