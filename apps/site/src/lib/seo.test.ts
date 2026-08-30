import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  absoluteUrl,
  canonicalUrl,
  DEFAULT_OG_IMAGE,
  metaDescription,
  pageSeo,
  truncateAtWord,
  withTitleSuffix,
} from "./seo";

describe("withTitleSuffix", () => {
  it("appends the club suffix to a bare page title", () => {
    expect(withTitleSuffix("Spielplan")).toBe("Spielplan | HB Dragons e.V.");
  });

  it("leaves a title alone that already carries the club name", () => {
    expect(withTitleSuffix("Seite nicht gefunden — HB Dragons e.V.")).toBe(
      "Seite nicht gefunden — HB Dragons e.V.",
    );
  });

  it("trims surrounding whitespace before templating", () => {
    expect(withTitleSuffix("  News  ")).toBe("News | HB Dragons e.V.");
  });
});

describe("truncateAtWord", () => {
  const cases: Array<{ name: string; text: string; max: number; expected: string }> = [
    {
      name: "returns short text unchanged",
      text: "Kurzer Text.",
      max: 155,
      expected: "Kurzer Text.",
    },
    {
      name: "returns text exactly at the limit unchanged",
      text: "a".repeat(20),
      max: 20,
      expected: "a".repeat(20),
    },
    {
      name: "cuts at the last word boundary before the limit",
      text: "Die HB Dragons sind ein Basketballverein aus Hannover",
      max: 20,
      expected: "Die HB Dragons sind…",
    },
    {
      name: "never cuts mid-word",
      text: "Basketball verbindet Menschen",
      max: 14,
      expected: "Basketball…",
    },
    {
      name: "hard-cuts a single word longer than the limit",
      text: "Basketballbundesligaspielbetrieb",
      max: 10,
      expected: "Basketball…",
    },
    {
      name: "drops trailing punctuation left at the cut",
      text: "Eins, zwei, drei, vier",
      max: 12,
      expected: "Eins, zwei…",
    },
    {
      name: "collapses internal whitespace",
      text: "Eins   zwei\n\ndrei",
      max: 155,
      expected: "Eins zwei drei",
    },
  ];

  for (const { name, text, max, expected } of cases) {
    it(name, () => {
      expect(truncateAtWord(text, max)).toBe(expected);
    });
  }

  it("defaults to the ~155 char meta description budget", () => {
    const words = Array.from({ length: 60 }, () => "Wort").join(" ");
    const result = truncateAtWord(words);
    expect(result.length).toBeLessThanOrEqual(156);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("metaDescription", () => {
  it("prefers the first non-blank candidate", () => {
    expect(metaDescription("Override", "Abgeleitet", "Fallback")).toBe("Override");
  });

  it("skips null, undefined and whitespace-only candidates", () => {
    expect(metaDescription(null, undefined, "   ", "Abgeleitet")).toBe("Abgeleitet");
  });

  it("truncates the winning candidate at a word boundary", () => {
    const long = Array.from({ length: 60 }, () => "Wort").join(" ");
    const result = metaDescription(long);
    expect(result.length).toBeLessThanOrEqual(156);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns an empty string when no candidate has content", () => {
    expect(metaDescription(null, undefined, "  ")).toBe("");
  });
});

describe("canonicalUrl", () => {
  it("joins the pathname onto the site origin", () => {
    expect(canonicalUrl("https://hbdragons.de", "/news/foo/")).toBe(
      "https://hbdragons.de/news/foo/",
    );
  });

  it("accepts a URL object for the site (Astro.site)", () => {
    expect(canonicalUrl(new URL("https://hbdragons.de"), "/teams/")).toBe(
      "https://hbdragons.de/teams/",
    );
  });

  it("adds the trailing slash the Apache host canonicalizes to", () => {
    expect(canonicalUrl("https://hbdragons.de", "/spielplan")).toBe(
      "https://hbdragons.de/spielplan/",
    );
  });

  it("normalizes an .html pathname to its directory form", () => {
    expect(canonicalUrl("https://hbdragons.de", "/404.html")).toBe("https://hbdragons.de/404/");
  });

  it("normalizes an index.html pathname to its directory form", () => {
    expect(canonicalUrl("https://hbdragons.de", "/news/index.html")).toBe(
      "https://hbdragons.de/news/",
    );
  });

  it("handles the root pathname", () => {
    expect(canonicalUrl("https://hbdragons.de", "/")).toBe("https://hbdragons.de/");
  });

  it("throws when the site is not configured", () => {
    expect(() => canonicalUrl(undefined, "/news/")).toThrow(/site/);
  });
});

describe("absoluteUrl", () => {
  it("passes absolute http(s) URLs through untouched", () => {
    expect(absoluteUrl("https://cms.hbdragons.de/media/foo.webp", "https://hbdragons.de")).toBe(
      "https://cms.hbdragons.de/media/foo.webp",
    );
  });

  it("resolves site-relative paths against the site origin", () => {
    expect(absoluteUrl("/img/banner.webp", "https://hbdragons.de")).toBe(
      "https://hbdragons.de/img/banner.webp",
    );
  });

  it("throws for a relative path without a configured site", () => {
    expect(() => absoluteUrl("/img/banner.webp", undefined)).toThrow(/site/);
  });
});

describe("DEFAULT_OG_IMAGE", () => {
  // The default once pointed at a path no build emitted, so every share card
  // without a CMS override 404ed. public/ ships byte-for-byte, so the path
  // must name a real file there — not an import under src/assets, whose output
  // name carries a content hash this constant cannot know.
  it("points at a file that actually ships in public/", () => {
    expect(DEFAULT_OG_IMAGE.startsWith("/img/")).toBe(true);
    const shipped = fileURLToPath(new URL(`../../public${DEFAULT_OG_IMAGE}`, import.meta.url));
    expect(existsSync(shipped), `${DEFAULT_OG_IMAGE} is not in public/`).toBe(true);
  });
});

describe("pageSeo", () => {
  const cmsBase = "http://localhost:3011";

  it("prefers the CMS description override over the route fallback", () => {
    const page = { seoDescription: "Override aus dem CMS." };
    expect(pageSeo(page, cmsBase, "Fallback.").description).toBe("Override aus dem CMS.");
  });

  it("falls back to the route description without an override", () => {
    expect(pageSeo({ seoDescription: null }, cmsBase, "Fallback.").description).toBe("Fallback.");
  });

  it("prefers the dedicated ogImage over the header image", () => {
    const page = {
      ogImage: { url: "/api/media/file/og.webp" },
      header: { image: { url: "/api/media/file/header.webp" } },
    };
    expect(pageSeo(page, cmsBase, "F").image).toBe("http://localhost:3011/api/media/file/og.webp");
  });

  it("uses the header image when no ogImage is set", () => {
    const page = { header: { image: { url: "/api/media/file/header.webp" } } };
    expect(pageSeo(page, cmsBase, "F").image).toBe(
      "http://localhost:3011/api/media/file/header.webp",
    );
  });

  it("returns the fallback description and no image for a missing page", () => {
    expect(pageSeo(null, cmsBase, "Fallback.")).toEqual({
      description: "Fallback.",
      image: null,
    });
  });
});
