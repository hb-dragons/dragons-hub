import { describe, expect, it } from "vitest";

import { publishedPage } from "./pages";

const entry = (slug: string, status: "draft" | "published" | null) => ({
  data: { slug, _status: status, header: { title: slug } },
});

describe("publishedPage", () => {
  const entries = [
    entry("news", "published"),
    entry("team", "draft"),
    entry("kontakt", "published"),
  ];

  it("returns the published page for the first matching slug", () => {
    expect(publishedPage(entries, "news")?.header.title).toBe("news");
  });

  it("skips drafts (the build API key sees them) and falls back through slugs", () => {
    expect(publishedPage(entries, "team", "kontakt")?.slug).toBe("kontakt");
  });

  it("returns null when no candidate slug has a published page", () => {
    expect(publishedPage(entries, "supporter")).toBeNull();
    expect(publishedPage([], "news")).toBeNull();
  });
});
