import { describe, expect, it } from "vitest";

import {
  clampWidths,
  DEFAULT_IMAGE_SIZES,
  DEFAULT_IMAGE_WIDTHS,
  imageBranch,
  plainSrc,
} from "./blur-image";

describe("imageBranch", () => {
  it("routes an imported asset through Astro's optimizer", () => {
    expect(imageBranch({ src: "/_astro/gesamt.hash.webp", width: 2400, format: "webp" })).toBe(
      "asset",
    );
  });

  it("passes an imported SVG through untouched — sharp cannot rasterise it", () => {
    expect(imageBranch({ src: "/_astro/logo.hash.svg", width: 512, format: "svg" })).toBe(
      "passthrough",
    );
  });

  it.each([
    "https://cms.hbdragons.de/api/media/file/herren_1.webp",
    "http://localhost:3002/api/media/file/u12.webp",
    "HTTPS://CMS.HBDRAGONS.DE/api/media/file/u14.jpg",
  ])("treats %s as a remote image needing inferSize", (url) => {
    expect(imageBranch(url)).toBe("remote");
  });

  it.each([
    ["/img/banner.webp", "a public/ path is not in the build graph"],
    ["/img/logo.svg", "a public/ SVG"],
    ["https://cms.hbdragons.de/api/media/file/wappen.svg", "a remote SVG"],
    ["https://cms.hbdragons.de/api/media/file/wappen.svg?v=2", "a remote SVG with a query"],
    ["https://cms.hbdragons.de/api/media/file/wappen.svg#icon", "a remote SVG with a fragment"],
  ])("passes %s through (%s)", (url) => {
    expect(imageBranch(url)).toBe("passthrough");
  });

  it("does not mistake a path merely containing 'svg' for an SVG", () => {
    expect(imageBranch("https://cms.hbdragons.de/api/media/file/svgtest.webp")).toBe("remote");
  });
});

describe("plainSrc", () => {
  it("returns a string source unchanged", () => {
    expect(plainSrc("/img/banner.webp")).toBe("/img/banner.webp");
  });

  it("unwraps an imported asset", () => {
    expect(plainSrc({ src: "/_astro/logo.hash.svg", width: 512, format: "svg" })).toBe(
      "/_astro/logo.hash.svg",
    );
  });
});

describe("clampWidths", () => {
  it("drops widths above the source so nothing is upscaled", () => {
    expect(clampWidths([400, 800, 1200], 900)).toEqual([400, 800]);
  });

  it("keeps every width when the source is larger than all of them", () => {
    expect(clampWidths([400, 800, 1200], 2400)).toEqual([400, 800, 1200]);
  });

  it("keeps a width equal to the source", () => {
    expect(clampWidths([400, 800], 800)).toEqual([400, 800]);
  });

  it("falls back to the source's own width rather than an empty srcset", () => {
    expect(clampWidths([400, 800, 1200], 240)).toEqual([240]);
  });
});

describe("defaults", () => {
  it("ships widths in ascending order", () => {
    expect([...DEFAULT_IMAGE_WIDTHS]).toEqual([...DEFAULT_IMAGE_WIDTHS].sort((a, b) => a - b));
  });

  it("pairs the widths with a sizes value, which Astro requires alongside them", () => {
    expect(DEFAULT_IMAGE_SIZES).toMatch(/vw/);
  });
});
