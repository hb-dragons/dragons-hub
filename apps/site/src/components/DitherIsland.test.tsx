// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/**
 * The island's job is not the shader — it is the render budget around it: draw
 * one pixel per dither cell, cap the loop at 30fps, park it when the band is
 * offscreen, and do not animate at all under reduced motion. None of that is
 * observable through a real GL context (there is none in happy-dom), so `ogl`
 * is mocked down to the four things the component touches and the assertions
 * are about what it *asks* ogl to do.
 */

// vi.mock's factory is hoisted above every top-level binding, so the fakes it
// needs are created with vi.hoisted and the classes are declared inside it.
const gl = vi.hoisted(() => ({
  setSize: vi.fn(),
  render3d: vi.fn(),
  loseContext: vi.fn(),
  uniforms: {} as Record<string, { value: number | Float32Array }>,
  rendererOptions: {} as Record<string, unknown>,
}));

vi.mock("ogl", () => ({
  Renderer: class {
    gl: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      gl.rendererOptions = options;
      this.gl = {
        canvas: document.createElement("canvas"),
        clearColor: vi.fn(),
        enable: vi.fn(),
        blendFunc: vi.fn(),
        BLEND: 1,
        SRC_ALPHA: 2,
        ONE_MINUS_SRC_ALPHA: 3,
        getExtension: () => ({ loseContext: gl.loseContext }),
      };
    }
    setSize(width: number, height: number) {
      gl.setSize(width, height);
      const canvas = this.gl.canvas as HTMLCanvasElement;
      canvas.width = width;
      canvas.height = height;
    }
    render(scene: unknown) {
      gl.render3d(scene);
    }
  },
  Program: class {
    uniforms: Record<string, { value: number | Float32Array }>;
    constructor(_gl: unknown, options: { uniforms: Record<string, { value: number }> }) {
      this.uniforms = options.uniforms;
      gl.uniforms = options.uniforms;
    }
  },
  Mesh: class {},
  Triangle: class {},
  Color: class {
    constructor(...channels: number[]) {
      Object.assign(this, channels);
    }
  },
}));

const { setSize, render3d, loseContext } = gl;

import DitherIsland from "./DitherIsland";

/** Drives the IntersectionObserver the component registers. */
let observerCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

/** rAF callbacks the component has queued, so tests can step frames by hand. */
let pendingFrame: ((t: number) => void) | null = null;
const cancelled: number[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  observerCallback = null;
  pendingFrame = null;
  cancelled.length = 0;

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        observerCallback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn();
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    pendingFrame = cb;
    return 7;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    cancelled.push(id);
    pendingFrame = null;
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Runs the queued rAF callback at `t` ms, as the browser would. */
function frame(t: number) {
  const cb = pendingFrame;
  if (!cb) throw new Error("no frame queued");
  act(() => cb(t));
}

/** Gives the island a container with a real size, since happy-dom reports 0. */
function renderIsland(props = {}) {
  const result = render(<DitherIsland pixelSize={3} enableMouseInteraction={false} {...props} />);
  return result;
}

beforeEach(() => {
  // happy-dom reports every element as 0x0; the band is 1440x300 in practice.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 1440,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 300,
  });
});

describe("DitherIsland", () => {
  it("sizes the drawing buffer to one pixel per dither cell", () => {
    renderIsland();
    // 1440x300 at pixelSize 3 — 9x fewer fragments than the container.
    expect(setSize).toHaveBeenCalledWith(480, 100);
    expect(gl.uniforms.resolution!.value).toEqual(new Float32Array([480, 100]));
  });

  it("hands the shader a cell size of 1, since the canvas carries the scale", () => {
    renderIsland();
    expect(gl.uniforms.pixelSize!.value).toBe(1);
  });

  it("upscales with nearest-neighbour so the cells keep their edges", () => {
    const { container } = renderIsland();
    const canvas = container.querySelector("canvas")!;
    expect(canvas.style.imageRendering).toBe("pixelated");
  });

  it("stretches the cell-resolution buffer back over the whole container", () => {
    // ogl's setSize assigns the buffer size to canvas.style, which would lay
    // the element out at 480x100 — a third of the band — with the rest of the
    // slot falling through to the gradient fallback.
    const { container } = renderIsland();
    const canvas = container.querySelector("canvas")!;
    expect(canvas.style.width).toBe("100%");
    expect(canvas.style.height).toBe("100%");
  });

  it("asks for no depth buffer and the low-power GPU", () => {
    renderIsland();
    // ogl defaults `depth` to true; a fullscreen triangle depth-tests against
    // nothing, so the buffer would be allocated and cleared for nothing.
    expect(gl.rendererOptions).toMatchObject({
      alpha: true,
      depth: false,
      antialias: false,
      powerPreference: "low-power",
    });
  });

  it("draws on a 30fps budget rather than every animation frame", () => {
    renderIsland();
    frame(0); // first frame always draws
    expect(render3d).toHaveBeenCalledTimes(1);

    frame(8); // 120Hz display: too soon
    frame(16);
    frame(25);
    expect(render3d).toHaveBeenCalledTimes(1);

    frame(34); // past 1000/30
    expect(render3d).toHaveBeenCalledTimes(2);
  });

  it("advances the shader clock only on the frames it draws", () => {
    renderIsland();
    frame(0);
    frame(8);
    expect(gl.uniforms.time!.value).toBe(0);
    frame(40);
    expect(gl.uniforms.time!.value).toBeCloseTo(0.04);
  });

  it("parks the loop when the band scrolls out of view and restarts it after", () => {
    renderIsland();
    expect(pendingFrame).not.toBeNull();

    act(() => observerCallback!([{ isIntersecting: false }]));
    expect(cancelled).toContain(7);
    expect(pendingFrame).toBeNull();

    act(() => observerCallback!([{ isIntersecting: true }]));
    expect(pendingFrame).not.toBeNull();
  });

  it("renders a single frame and never loops under reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
    }));
    renderIsland();
    expect(render3d).toHaveBeenCalledTimes(1);
    expect(pendingFrame).toBeNull();

    // Scrolling it into view must not start the animation either.
    act(() => observerCallback!([{ isIntersecting: true }]));
    expect(pendingFrame).toBeNull();
  });

  it("tears down the loop, the observer and the GL context on unmount", () => {
    const { unmount } = renderIsland();
    unmount();
    expect(cancelled).toContain(7);
    expect(disconnect).toHaveBeenCalled();
    expect(loseContext).toHaveBeenCalled();
  });
});
