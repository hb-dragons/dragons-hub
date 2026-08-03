import { describe, expect, it } from "vitest";

import { buildStrapiUrl, mergePages } from "./strapi";

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
