// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

import { useIsMobile } from "./use-mobile";

afterEach(cleanup);

/** Replaces window.matchMedia with a stub that records its listeners. */
function stubMatchMedia() {
  const listeners = new Set<() => void>();
  const addEventListener = vi.fn((_: string, fn: () => void) =>
    listeners.add(fn),
  );
  const removeEventListener = vi.fn((_: string, fn: () => void) =>
    listeners.delete(fn),
  );
  const matchMedia = vi.fn((query: string) => ({
    media: query,
    matches: window.innerWidth < 768,
    addEventListener,
    removeEventListener,
  }));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
  return { matchMedia, addEventListener, removeEventListener, listeners };
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

function Probe({ onRender }: { onRender: (isMobile: boolean) => void }) {
  onRender(useIsMobile());
  return null;
}

let media: ReturnType<typeof stubMatchMedia>;

beforeEach(() => {
  media = stubMatchMedia();
});

describe("useIsMobile", () => {
  it("reports mobile below the 768px breakpoint", () => {
    setWidth(500);
    const seen: boolean[] = [];
    render(<Probe onRender={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(true);
  });

  it("reports desktop at exactly the breakpoint", () => {
    // The breakpoint is exclusive: 768 is the narrowest desktop width.
    setWidth(768);
    const seen: boolean[] = [];
    render(<Probe onRender={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(false);
  });

  it("reports desktop above the breakpoint", () => {
    setWidth(1280);
    const seen: boolean[] = [];
    render(<Probe onRender={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(false);
  });

  it("coerces the undefined first render to false rather than leaking it", () => {
    setWidth(1280);
    const seen: boolean[] = [];
    render(<Probe onRender={(v) => seen.push(v)} />);
    // Every observed value is a real boolean, never undefined — callers such as
    // SidebarProvider branch on it directly.
    expect(seen.every((v) => typeof v === "boolean")).toBe(true);
  });

  it("queries one below the breakpoint so the media query and the width agree", () => {
    setWidth(1280);
    render(<Probe onRender={() => {}} />);
    expect(media.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
  });

  it("re-reads the width when the media query changes", () => {
    setWidth(1280);
    const seen: boolean[] = [];
    render(<Probe onRender={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(false);

    setWidth(400);
    act(() => {
      for (const fn of media.listeners) fn();
    });
    expect(seen.at(-1)).toBe(true);
  });

  it("removes its listener on unmount", () => {
    setWidth(1280);
    const { unmount } = render(<Probe onRender={() => {}} />);
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    expect(media.listeners.size).toBe(0);
  });
});
