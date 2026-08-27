/**
 * WebGL dither-wave background, ported from dragons-app UiDither (ogl).
 * Mounted as a lazy island (client:visible) over a static gradient fallback.
 * Deviations from the legacy component: the per-frame FPS console.log (and
 * its enablePerformanceMonitoring flag) is deleted per plan Task C4, and the
 * uniform-diffing for reactive prop updates is dropped — island props are
 * fixed at mount, a prop change simply re-runs the effect.
 *
 * The shader is fill-bound: `pattern()` is fbm(p - fbm(p + fbm(p2))) at four
 * octaves, so twelve Perlin evaluations per fragment. Everything that keeps
 * that affordable is about drawing fewer fragments, less often — the drawing
 * buffer is one pixel per dither cell (renderTargetSize), the loop draws on a
 * 30fps budget (shouldRenderFrame) and parks entirely when the band is
 * offscreen or the visitor asked for reduced motion. Measured on an M1 Pro at
 * 3840x2160, the buffer scale alone is ~6x: 6.8ms/frame down to 1.1ms.
 */
import { useEffect, useRef } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";

import {
  prefersReducedMotion,
  renderTargetSize,
  shouldRenderFrame,
} from "../lib/dither-render";

export interface DitherProps {
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  waveColor?: [number, number, number];
  colorNum?: number;
  pixelSize?: number;
  disableAnimation?: boolean;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
}

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision mediump float;

uniform float time;
uniform vec2 resolution;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;
uniform float colorNum;
uniform float pixelSize;

varying vec2 vUv;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - time * waveSpeed;
  return fbm(p - fbm(p + fbm(p2)));
}

float getBayerValue(vec2 coord) {
  vec2 p = mod(coord, 4.0);
  int x = int(p.x);
  int y = int(p.y);

  if (y == 0) {
    if (x == 0) return 0.0/16.0;
    if (x == 1) return 8.0/16.0;
    if (x == 2) return 2.0/16.0;
    return 10.0/16.0;
  } else if (y == 1) {
    if (x == 0) return 12.0/16.0;
    if (x == 1) return 4.0/16.0;
    if (x == 2) return 14.0/16.0;
    return 6.0/16.0;
  } else if (y == 2) {
    if (x == 0) return 3.0/16.0;
    if (x == 1) return 11.0/16.0;
    if (x == 2) return 1.0/16.0;
    return 9.0/16.0;
  } else {
    if (x == 0) return 15.0/16.0;
    if (x == 1) return 7.0/16.0;
    if (x == 2) return 13.0/16.0;
    return 5.0/16.0;
  }
}

vec3 dither(vec2 uv, vec3 color) {
  vec2 scaledCoord = floor(uv * resolution / pixelSize);
  float threshold = getBayerValue(scaledCoord) - 0.25;
  float step = 1.0 / (colorNum - 1.0);
  color += threshold * step;
  float bias = 0.2;
  color = clamp(color - bias, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 centeredUv = uv - 0.5;
  centeredUv.x *= resolution.x / resolution.y;

  float f = pattern(centeredUv);

  if (enableMouseInteraction == 1) {
    vec2 mouseNDC = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= resolution.x / resolution.y;
    float dist = length(centeredUv - mouseNDC);
    float effect = 1.0 - smoothstep(0.0, mouseRadius, dist);
    f -= 0.5 * effect;
  }

  vec3 col = mix(vec3(0.0), waveColor, f);
  col = dither(uv, col);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function DitherIsland({
  waveSpeed = 0.05,
  waveFrequency = 3,
  waveAmplitude = 0.3,
  waveColor = [0.5, 0.5, 0.5],
  colorNum = 4,
  pixelSize = 2,
  disableAnimation = false,
  enableMouseInteraction = true,
  mouseRadius = 1,
}: DitherProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // `depth` defaults to true in ogl, and a fullscreen triangle has nothing
    // to depth-test against — the buffer is allocated and cleared every frame
    // for nothing. `low-power` keeps a laptop on its integrated GPU.
    const renderer = new Renderer({
      alpha: true,
      depth: false,
      antialias: false,
      powerPreference: "low-power",
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.display = "block";
    // The drawing buffer is one pixel per dither cell (see renderTargetSize),
    // so the browser scales it up. Anything but nearest-neighbour would
    // blur the cell edges back into a gradient.
    canvas.style.imageRendering = "pixelated";
    container.appendChild(canvas);

    /**
     * ogl's `setSize` writes the buffer size straight onto `canvas.style`, so
     * the element would lay out at cell resolution — a third of the band —
     * instead of being stretched back over it. Re-assert the CSS size after
     * every call.
     */
    const sizeTo = (cssWidth: number, cssHeight: number) => {
      const target = renderTargetSize(cssWidth, cssHeight, pixelSize);
      renderer.setSize(target.width, target.height);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      return target;
    };

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 150;
    const target = sizeTo(width, height);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        time: { value: 0 },
        resolution: { value: new Float32Array([target.width, target.height]) },
        waveSpeed: { value: waveSpeed },
        waveFrequency: { value: waveFrequency },
        waveAmplitude: { value: waveAmplitude },
        waveColor: { value: new Color(...waveColor) },
        mousePos: { value: new Float32Array([target.width / 2, target.height / 2]) },
        enableMouseInteraction: { value: enableMouseInteraction ? 1 : 0 },
        mouseRadius: { value: mouseRadius },
        colorNum: { value: colorNum },
        // One rendered pixel is one dither cell, so the shader's own
        // quantisation step is off. The cell size lives in the canvas scale.
        pixelSize: { value: 1 },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    let animationId: number | null = null;
    let lastFrameAt: number | null = null;
    const currentMouse = [0, 0];
    let targetMouse = [0, 0];
    let lastMouseUpdate = 0;
    let cachedRect: DOMRect | null = null;
    let cachedRectAt = 0;
    let resizeTimeout: number | null = null;

    const resize = () => {
      if (resizeTimeout !== null) window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        const { clientWidth, clientHeight } = container;
        const next = sizeTo(clientWidth, clientHeight);
        program.uniforms.resolution!.value[0] = next.width;
        program.uniforms.resolution!.value[1] = next.height;
        cachedRect = null;
        // A resize with the loop parked (offscreen, or reduced motion) leaves
        // a stale buffer at the old size, so repaint once.
        if (animationId === null) renderer.render({ scene: mesh });
      }, 100);
    };

    const handleMouseMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - lastMouseUpdate < 16) return; // ~60fps throttle
      lastMouseUpdate = now;
      if (!cachedRect || now - cachedRectAt > 100) {
        cachedRect = container.getBoundingClientRect();
        cachedRectAt = now;
      }
      const normalizedX = (event.clientX - cachedRect.left) / cachedRect.width;
      const normalizedY = (event.clientY - cachedRect.top) / cachedRect.height;
      targetMouse = [normalizedX * gl.canvas.width, normalizedY * gl.canvas.height];
    };

    const handleMouseLeave = () => {
      targetMouse = [gl.canvas.width / 2, gl.canvas.height / 2];
    };

    const update = (t: number) => {
      animationId = requestAnimationFrame(update);
      // rAF runs at the display rate — 120Hz on a ProMotion Mac, for a wave
      // that drifts at waveSpeed 0.2. Draw on a 30fps budget instead.
      if (!shouldRenderFrame(t, lastFrameAt)) return;
      lastFrameAt = t;

      if (enableMouseInteraction) {
        const smoothing = 0.05;
        currentMouse[0]! += smoothing * (targetMouse[0]! - currentMouse[0]!);
        currentMouse[1]! += smoothing * (targetMouse[1]! - currentMouse[1]!);
        program.uniforms.mousePos!.value[0] = currentMouse[0];
        program.uniforms.mousePos!.value[1] = currentMouse[1];
      }
      if (!disableAnimation) {
        program.uniforms.time!.value = t * 0.001;
      }
      renderer.render({ scene: mesh });
    };

    const start = () => {
      if (animationId === null) animationId = requestAnimationFrame(update);
    };
    const stop = () => {
      if (animationId !== null) cancelAnimationFrame(animationId);
      animationId = null;
    };

    window.addEventListener("resize", resize);
    if (enableMouseInteraction) {
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseleave", handleMouseLeave);
    }

    // Reduced motion gets the pattern, not the animation: one frame, no loop.
    const reducedMotion = prefersReducedMotion();

    // Scrolling past used to leave rAF firing at the display rate to hit a
    // `return` — now the loop parks until the band comes back.
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? true;
        if (visible && !reducedMotion) start();
        else stop();
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(container);

    if (reducedMotion) renderer.render({ scene: mesh });
    else start();

    return () => {
      stop();
      if (resizeTimeout !== null) window.clearTimeout(resizeTimeout);
      intersectionObserver.disconnect();
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (canvas.parentNode === container) container.removeChild(canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [
    waveSpeed,
    waveFrequency,
    waveAmplitude,
    waveColor,
    colorNum,
    pixelSize,
    disableAnimation,
    enableMouseInteraction,
    mouseRadius,
  ]);

  return <div ref={containerRef} className="w-full h-full absolute top-0 left-0" />;
}
