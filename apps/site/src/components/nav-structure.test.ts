import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The scrolled nav gets `backdrop-filter: blur(24px)`, and a backdrop-filter
 * turns an element into the containing block for every `position: fixed`
 * descendant. While the mobile drawer lived inside <nav>, its
 * `fixed top-1 bottom-1` resolved against the header bar instead of the
 * viewport, so a scrolled page got a drawer exactly as tall as the blur bar.
 * Astro components do not render under vitest, so this pins the source
 * structure the way document-structure.test.ts pins the pages.
 */

const NAVBAR = readFileSync(
  fileURLToPath(new URL("./NavBar.astro", import.meta.url)),
  "utf8",
);

describe("NavBar mobile drawer containing block", () => {
  const navClose = NAVBAR.indexOf("</nav>");

  it("keeps the fixed drawer outside the backdrop-filtered <nav>", () => {
    expect(navClose).toBeGreaterThan(-1);
    expect(NAVBAR.indexOf('id="nav-drawer"')).toBeGreaterThan(navClose);
  });

  it("keeps the fixed backdrop outside the backdrop-filtered <nav>", () => {
    expect(NAVBAR.indexOf('id="nav-backdrop"')).toBeGreaterThan(navClose);
  });

  it("drives the open state from <html>, where the script also sets it", () => {
    // Outside the nav, `#site-nav[data-menu-open] .nav-drawer` can no longer
    // match — the html attribute is the one that reaches siblings.
    expect(NAVBAR).not.toMatch(/#site-nav\[data-menu-open]\)?\s+\.nav-(drawer|backdrop)/);
    expect(NAVBAR).toMatch(/html\[data-menu-open]\)?\s+\.nav-drawer/);
    expect(NAVBAR).toMatch(/html\[data-menu-open]\)?\s+\.nav-backdrop/);
  });
});
