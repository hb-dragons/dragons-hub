import { describe, expect, it } from "vitest";

import { buildStrapiUrl, isLastPage, mergePages } from "./strapi";

describe("buildStrapiUrl", () => {
  it("asks for published documents by default and a full page", () => {
    const url = buildStrapiUrl("https://cms.example.de", "posts", 1, {});
    // URLSearchParams's application/x-www-form-urlencoded serialization
    // leaves "*" unescaped (verified on Node 24 and Bun 1.3) — RFC 3986
    // percent-encoding would use %2A, but that is not what this runtime does.
    expect(url).toBe(
      "https://cms.example.de/api/posts?pagination%5Bpage%5D=1&pagination%5BpageSize%5D=100&populate=*&status=published",
    );
  });

  it("strips a trailing slash from the base so the path is not doubled", () => {
    const url = buildStrapiUrl("https://cms.example.de/", "teams", 2, {});
    expect(url).toContain("https://cms.example.de/api/teams?");
    expect(url).not.toContain("//api");
  });

  it("lets a caller override status to read drafts", () => {
    const url = buildStrapiUrl("https://cms.example.de", "partners", 1, { status: "draft" });
    expect(url).toContain("status=draft");
  });

  it("replaces the blanket populate=* with a deep-populate override rather than appending it", () => {
    const url = buildStrapiUrl("https://cms.example.de", "teams", 1, {
      "populate[training][populate]": "*",
      "populate[teamImage]": "true",
    });
    // The deep-populate keys are present...
    expect(url).toContain("populate%5Btraining%5D%5Bpopulate%5D=*");
    expect(url).toContain("populate%5BteamImage%5D=true");
    // ...and the blanket populate=* this would otherwise carry is gone, not
    // merely joined by an "&" alongside it.
    expect(url).not.toContain("populate=*");
  });
});

describe("mergePages", () => {
  it("concatenates pages in order", () => {
    expect(mergePages([[{ id: 1 }], [{ id: 2 }, { id: 3 }]])).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
  });
});

describe("isLastPage", () => {
  it("is false while the current page trails pageCount", () => {
    expect(isLastPage("posts", 1, 3)).toBe(false);
  });

  it("is true once the current page reaches pageCount", () => {
    expect(isLastPage("posts", 3, 3)).toBe(true);
  });

  it("throws instead of looping forever when pageCount is missing", () => {
    expect(() => isLastPage("posts", 1, undefined)).toThrow(
      "strapi: posts page 1 has a non-numeric pageCount (undefined)",
    );
  });

  it("throws when pageCount is present but not a number", () => {
    expect(() => isLastPage("teams", 2, "3")).toThrow(/non-numeric pageCount \("3"\)/);
  });

  it("throws on a non-finite pageCount (NaN, Infinity)", () => {
    expect(() => isLastPage("teams", 1, Number.NaN)).toThrow(/non-numeric pageCount/);
    expect(() => isLastPage("teams", 1, Number.POSITIVE_INFINITY)).toThrow(/non-numeric pageCount/);
  });
});
