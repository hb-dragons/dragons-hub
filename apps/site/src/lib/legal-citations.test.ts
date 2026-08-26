import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { IMPRESSUM_BOARD } from "./board";

// Issue #242: the TMG was repealed on 2024-05-14 (§ 5 TMG became § 5 DDG) and
// the MStV was renumbered (§ 55 Abs. 2 became § 18 Abs. 2). The legal pages
// are hand-written Astro outside any type system, so this test reads them from
// disk the way docs-drift.test.ts reads AGENTS.md, and fails when a repealed
// statute creeps back in or the section numbering breaks.

const SRC = fileURLToPath(new URL("..", import.meta.url));
const IMPRESSUM = readFileSync(join(SRC, "pages/impressum/index.astro"), "utf8");
const DATENSCHUTZ = readFileSync(join(SRC, "pages/datenschutz/index.astro"), "utf8");
const KONTO_LOESCHEN = readFileSync(join(SRC, "pages/konto-loeschen/index.astro"), "utf8");
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

  it("cites the repealed TTDSG nowhere in src", () => {
    // Renamed to the TDDDG by the same 2024-05-14 act that retired the TMG.
    const offenders = walk(SRC)
      .filter((file) => /\.(astro|ts|tsx)$/.test(file) && !file.endsWith(".test.ts"))
      .filter((file) => /\bTTDSG\b/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(SRC.length));
    expect(offenders).toEqual([]);
  });

  it("opens the Impressum with § 5 DDG and § 18 Abs. 2 MStV", () => {
    expect(IMPRESSUM).toContain("§ 5 DDG");
    expect(IMPRESSUM).toContain("§ 18 Abs. 2 MStV");
  });

  it("rests the liability section on the Digital Services Act", () => {
    expect(IMPRESSUM).toMatch(/Art\. 8 der Verordnung \(EU\) 2022\/2065/);
  });

  it("claims no hosting privilege — the site stores no user-posted content", () => {
    expect(IMPRESSUM).not.toMatch(/Art\. 6/);
  });

  it("names the person responsible under § 18 Abs. 2 MStV", () => {
    expect(IMPRESSUM).toMatch(/Verantwortlich[^<]*§ 18 Abs\. 2 MStV/);
  });

  it("takes both board statements from one source, so they cannot disagree", () => {
    // Both the § 26 BGB list and the § 18 MStV responsible now render from
    // IMPRESSUM_BOARD (#270), which the build also checks against the CMS.
    expect(IMPRESSUM).toContain("IMPRESSUM_BOARD.map");
    expect(IMPRESSUM).toMatch(/§ 18 Abs\. 2 MStV:<\/p>\s*<div[^>]*>\s*<p>\{chair\?\.name\}, \{chair\?\.role\}<\/p>/);
    expect(IMPRESSUM_BOARD.some((member) => /^1\. Vorsitzende/.test(member.role))).toBe(true);
  });

  it("promises no Bildnachweise the CMS cannot attach to an image", () => {
    expect(IMPRESSUM).not.toContain("Bildnachweise");
  });

  it("calls the club Diensteanbieter throughout, never Seitenbetreiber", () => {
    expect(IMPRESSUM).not.toContain("Seitenbetreiber");
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

// Issue #241: the Datenschutzerklärung now covers the website, the Web-App and
// the Dragons App in one document. It is hand-written Astro like the Impressum,
// so the same on-disk checks guard the parts that go stale silently — retired
// providers, renamed statutes, and the anchor the app and both store records
// link to.
describe("Datenschutzerklärung", () => {
  it("names no retired provider", () => {
    // IONOS hosted the old Strapi CMS; both were replaced by Payload on Google
    // Cloud. Naming a processor we no longer use is a false Art. 13 statement.
    expect(DATENSCHUTZ).not.toMatch(/IONOS/i);
    expect(DATENSCHUTZ).not.toMatch(/Strapi/i);
  });

  it("keeps the stable #app anchor the app and the store records link to", () => {
    expect(DATENSCHUTZ).toMatch(/<section id="app"/);
  });

  it("records that no Datenschutzbeauftragter is appointed", () => {
    expect(DATENSCHUTZ).toContain("Ein Datenschutzbeauftragter ist nicht benannt");
  });

  it("rests device storage on § 25 Abs. 2 Nr. 2 TDDDG", () => {
    expect(DATENSCHUTZ).toContain("§ 25 Abs. 2 Nr. 2 TDDDG");
  });

  it("states that the public site sets no cookies", () => {
    // The static site sets none; the session cookie belongs to the Web-App.
    expect(DATENSCHUTZ).toMatch(/setzt <strong>keine Cookies<\/strong>/);
  });

  it("declares joint controllership for the Meta pages", () => {
    expect(DATENSCHUTZ).toContain("Art. 26 DSGVO");
  });

  it("names both safeguards for the US transfers", () => {
    expect(DATENSCHUTZ).toContain("EU-US Data Privacy Framework");
    expect(DATENSCHUTZ).toContain("Standardvertragsklauseln");
    expect(DATENSCHUTZ).toContain("Art. 46 Abs. 2 lit. c DSGVO");
  });

  it("discloses the federation as the source of third-party data", () => {
    expect(DATENSCHUTZ).toContain("Art. 14 Abs. 2 lit. f DSGVO");
  });

  it("promises the same deletion window as the Konto-löschen page", () => {
    // Both pages are read by the app stores; a mismatch between them is the
    // kind of contradiction a reviewer notices.
    for (const page of [DATENSCHUTZ, KONTO_LOESCHEN]) {
      expect(page).toMatch(/innerhalb von 30 Tagen/);
      expect(page).toContain("datenschutz@hbdragons.de");
    }
  });

  it("numbers the sections contiguously from 1", () => {
    // \s* because a long heading wraps to the next line under Prettier.
    const numbers = [...DATENSCHUTZ.matchAll(/<h2[^>]*>\s*(\d+)\. /g)].map((m) => Number(m[1]));
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("numbers every app subsection under its own section", () => {
    const section = Number(/<h2[^>]*>\s*(\d+)\. Dragons App/.exec(DATENSCHUTZ)?.[1]);
    expect(section).toBeGreaterThan(0);
    const subs = [...DATENSCHUTZ.matchAll(/<h3[^>]*>(\d+)\.(\d+) /g)];
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.map((m) => Number(m[1]))).toEqual(subs.map(() => section));
    expect(subs.map((m) => Number(m[2]))).toEqual(subs.map((_, i) => i + 1));
  });
});
