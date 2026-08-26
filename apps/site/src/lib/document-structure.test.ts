import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Issue #263 (headings) and #262 (icons). Astro pages are compiled, not
 * importable under vitest, so this reads them from disk the way
 * legal-citations.test.ts reads the legal pages and asserts the structural
 * rules a renderer would otherwise have to prove.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const PAGES = join(SRC, "pages");
const PUBLIC = fileURLToPath(new URL("../../public/", import.meta.url));
const LAYOUT = readFileSync(join(SRC, "layouts/Layout.astro"), "utf8");

function pageFiles(dir: string = PAGES): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return full.endsWith(".astro") ? [full] : [];
  });
}

const PAGE_FILES = pageFiles();
const rel = (f: string) => f.slice(SRC.length);
const countTag = (source: string, tag: string) =>
  (source.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;

describe("page structure", () => {
  it("found the pages", () => {
    expect(PAGE_FILES.length).toBeGreaterThan(10);
  });

  // PageHeader always emits the page's h1. A page that renders PageHeader and
  // its own h1 shows its title twice and ships two h1 elements.
  it("leaves the h1 to PageHeader on every page that renders one", () => {
    const offenders = PAGE_FILES.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("<PageHeader") && countTag(source, "h1") > 0;
    }).map(rel);
    expect(offenders).toEqual([]);
  });

  // A page without PageHeader still needs exactly one h1 of its own.
  it("gives every page without PageHeader exactly one h1", () => {
    const wrong = PAGE_FILES.filter((file) => {
      const source = readFileSync(file, "utf8");
      return !source.includes("<PageHeader") && countTag(source, "h1") !== 1;
    }).map(rel);
    expect(wrong).toEqual([]);
  });

  // Layout.astro already opens the single <main> landmark.
  it("opens no second main landmark inside a page", () => {
    expect(countTag(LAYOUT, "main")).toBe(1);
    const nested = PAGE_FILES.filter((file) => countTag(readFileSync(file, "utf8"), "main") > 0).map(
      rel,
    );
    expect(nested).toEqual([]);
  });
});

describe("document head", () => {
  it.each([
    ["favicon.svg", /rel="icon"[^>]*href="\/favicon\.svg"/],
    ["favicon.png", /rel="icon"[^>]*href="\/favicon\.png"/],
    ["apple-touch-icon.png", /rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/],
  ])("links %s and ships the file", (file, link) => {
    expect(LAYOUT).toMatch(link);
    expect(existsSync(join(PUBLIC, file)), `public/${file} is missing`).toBe(true);
  });

  it("declares a theme colour", () => {
    expect(LAYOUT).toMatch(/name="theme-color"/);
  });

  // A hard-coded dark page must say so, or the browser paints scrollbars,
  // autofill and form popups in light-mode chrome against a dark background.
  it("declares the colour scheme it forces", () => {
    expect(LAYOUT).toMatch(/color-scheme/);
  });
});
