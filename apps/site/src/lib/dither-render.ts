/**
 * Render-budget helpers for the Dither island. They live here rather than
 * inside the WebGL effect so they can be tested without a GL context — the
 * effect itself is untestable under vitest (no WebGL in node or happy-dom).
 */

/** Frames per second the dither loop targets. */
export const DITHER_TARGET_FPS = 30;

export interface RenderTarget {
  width: number;
  height: number;
  /** CSS pixels per rendered pixel. */
  scale: number;
}

/**
 * The drawing-buffer size for a container of `cssWidth` x `cssHeight`.
 *
 * `pixelSize` already quantises the shader's output to a Bayer grid of that
 * many CSS pixels, so evaluating the noise once per CSS pixel computes 8 of
 * every 9 fragments (at the default 3) only to throw them away. Rendering at
 * 1/pixelSize and letting the canvas upscale with `image-rendering: pixelated`
 * produces the same grid for a fraction of the fragment work — the shader is
 * fill-bound, at 12 Perlin evaluations per fragment.
 *
 * The caller must then pass `pixelSize: 1` to the shader, since one rendered
 * pixel is now one dither cell.
 */
export function renderTargetSize(
  cssWidth: number,
  cssHeight: number,
  pixelSize: number,
): RenderTarget {
  const scale = Math.max(1, Math.round(pixelSize) || 1);
  return {
    width: Math.max(1, Math.ceil(cssWidth / scale)),
    height: Math.max(1, Math.ceil(cssHeight / scale)),
    scale,
  };
}

/**
 * Whether enough time has passed since `lastFrameAt` to draw again.
 *
 * requestAnimationFrame fires at the display's rate, which is 120 Hz on a
 * ProMotion Mac — four times the work for an animation whose wave drifts at
 * `waveSpeed` 0.2. A `lastFrameAt` of null is the first frame and always draws.
 */
export function shouldRenderFrame(
  now: number,
  lastFrameAt: number | null,
  fps: number = DITHER_TARGET_FPS,
): boolean {
  if (lastFrameAt === null) return true;
  if (fps <= 0) return true;
  return now - lastFrameAt >= 1000 / fps;
}

/**
 * Whether the visitor asked for reduced motion.
 *
 * Returns false when `matchMedia` is missing (SSR, old browsers) so the
 * animation is the default rather than the exception.
 */
export function prefersReducedMotion(win: Pick<Window, "matchMedia"> = window): boolean {
  if (typeof win?.matchMedia !== "function") return false;
  return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
