import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  clampWidths,
  DEFAULT_IMAGE_SIZES,
  DEFAULT_IMAGE_WIDTHS,
  fallbackWidth,
  imageBranch,
  imageClasses,
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

describe("fallbackWidth", () => {
  // Without an explicit width, Astro's fallback `src` is the original — the
  // home page's club photo handed 733 KB to every srcset-ignoring client.
  it("caps the fallback src at the largest srcset candidate", () => {
    expect(fallbackWidth([400, 800, 1200], 1920)).toBe(1200);
  });

  it("never asks for more than the source has", () => {
    expect(fallbackWidth([400, 800, 1200], 900)).toBe(800);
  });

  it("falls back to the source's own width when every candidate is larger", () => {
    expect(fallbackWidth([400, 800, 1200], 240)).toBe(240);
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

describe("imageClasses", () => {
  it("defaults to object-cover when the caller sets no object-fit", () => {
    expect(imageClasses("").join(" ")).toContain("object-cover");
    expect(imageClasses("group-hover:md:scale-105").join(" ")).toContain("object-cover");
  });

  // Both utilities on one element resolve by stylesheet order (Tailwind emits
  // object-cover after object-contain), so the default must be omitted, not
  // merely followed by the caller's class.
  it("drops the default when the caller sets its own object-fit", () => {
    const withContain = imageClasses("object-contain").join(" ");
    expect(withContain).toContain("object-contain");
    expect(withContain).not.toContain("object-cover");
    expect(imageClasses("object-cover").join(" ")).toContain("object-cover");
  });

  it("does not mistake hover-variant object utilities for a base object-fit", () => {
    expect(imageClasses("hover:object-contain").join(" ")).toContain("object-cover");
  });
});

// Tailwind v4's scale-*/rotate-*/translate-* utilities animate the native
// `scale`/`rotate`/`translate` properties, not `transform`. The blur-fade
// style overrides transition-property on every blurhash image, so it must
// name them all or the callers' hover zooms snap instead of animating.
describe("BlurImage fade style", () => {
  const component = readFileSync(
    fileURLToPath(new URL("../components/BlurImage.astro", import.meta.url)),
    "utf8",
  );

  it("transitions the native transform properties alongside opacity", () => {
    const property = component.match(/transition-property:\s*([^;]+);/)?.[1] ?? "";
    for (const needed of ["opacity", "transform", "translate", "scale", "rotate"]) {
      expect(property).toContain(needed);
    }
  });

  it("gives every transitioned property a duration", () => {
    const property = component.match(/transition-property:\s*([^;]+);/)?.[1] ?? "";
    const duration = component.match(/transition-duration:\s*([^;]+);/)?.[1] ?? "";
    expect(duration.split(",").length).toBe(property.split(",").length);
  });
});
