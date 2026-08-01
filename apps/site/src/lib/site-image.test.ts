import { describe, expect, it } from "vitest";

import { toSiteImage } from "./site-image";

describe("toSiteImage", () => {
  it("returns null for missing media or url", () => {
    expect(toSiteImage(null, "http://cms")).toBeNull();
    expect(toSiteImage(undefined, undefined)).toBeNull();
    expect(toSiteImage({ url: null, blurhash: "hash", alt: "x" }, "http://cms")).toBeNull();
  });

  it("prefixes relative CMS urls with the base", () => {
    expect(
      toSiteImage({ url: "/api/media/file/a.webp", blurhash: "hash", alt: "Banner" }, "http://cms"),
    ).toEqual({ url: "http://cms/api/media/file/a.webp", blurhash: "hash", alt: "Banner" });
  });

  it("passes absolute urls through and keeps nullish decorations", () => {
    expect(toSiteImage({ url: "https://cdn/x.webp" }, undefined)).toEqual({
      url: "https://cdn/x.webp",
      blurhash: undefined,
      alt: undefined,
    });
  });
});
