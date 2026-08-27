import { describe, expect, it } from "vitest";

import {
  DITHER_TARGET_FPS,
  prefersReducedMotion,
  renderTargetSize,
  shouldRenderFrame,
} from "./dither-render";

describe("renderTargetSize", () => {
  it("divides the drawing buffer by the dither cell size", () => {
    expect(renderTargetSize(1440, 300, 3)).toEqual({ width: 480, height: 100, scale: 3 });
  });

  it("rounds up so the upscaled canvas covers the container", () => {
    // 380 / 3 = 126.67 — flooring would leave a 1px gap at the bottom edge.
    expect(renderTargetSize(1441, 380, 3)).toEqual({ width: 481, height: 127, scale: 3 });
  });

  it("renders 1:1 when the shader draws one pixel per cell", () => {
    expect(renderTargetSize(800, 200, 1)).toEqual({ width: 800, height: 200, scale: 1 });
  });

  it("rounds a fractional pixelSize to a whole number of pixels", () => {
    expect(renderTargetSize(900, 300, 2.4)).toEqual({ width: 450, height: 150, scale: 2 });
  });

  it("never scales up, whatever nonsense the caller passes", () => {
    for (const pixelSize of [0, -4, Number.NaN]) {
      expect(renderTargetSize(640, 480, pixelSize)).toEqual({
        width: 640,
        height: 480,
        scale: 1,
      });
    }
  });

  it("keeps a degenerate container at one pixel rather than zero", () => {
    // ogl would throw on a zero-sized drawing buffer.
    expect(renderTargetSize(0, 0, 3)).toEqual({ width: 1, height: 1, scale: 3 });
  });
});

describe("shouldRenderFrame", () => {
  it("always draws the first frame", () => {
    expect(shouldRenderFrame(0, null)).toBe(true);
  });

  it("skips a frame that arrives before the interval has elapsed", () => {
    // 120Hz display: rAF fires every ~8.3ms, the 30fps budget is 33.3ms.
    expect(shouldRenderFrame(8.3, 0)).toBe(false);
    expect(shouldRenderFrame(16.6, 0)).toBe(false);
    expect(shouldRenderFrame(25, 0)).toBe(false);
  });

  it("draws once the interval has elapsed", () => {
    expect(shouldRenderFrame(1000 / DITHER_TARGET_FPS, 0)).toBe(true);
    expect(shouldRenderFrame(100, 0)).toBe(true);
  });

  it("honours a custom rate", () => {
    expect(shouldRenderFrame(20, 0, 60)).toBe(true);
    expect(shouldRenderFrame(10, 0, 60)).toBe(false);
  });

  it("draws every frame when the cap is disabled", () => {
    expect(shouldRenderFrame(1, 0, 0)).toBe(true);
  });
});

describe("prefersReducedMotion", () => {
  const win = (matches: boolean) => ({
    matchMedia: (query: string) => {
      expect(query).toBe("(prefers-reduced-motion: reduce)");
      return { matches } as MediaQueryList;
    },
  });

  it("reports the media query result", () => {
    expect(prefersReducedMotion(win(true))).toBe(true);
    expect(prefersReducedMotion(win(false))).toBe(false);
  });

  it("defaults to animating when matchMedia is missing", () => {
    expect(prefersReducedMotion({} as unknown as Window)).toBe(false);
  });
});
