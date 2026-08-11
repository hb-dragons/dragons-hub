import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatGlobalError, installGlobalErrorHandler } from "@/lib/global-error-handler";

type Handler = (error: unknown, isFatal?: boolean) => void;

/**
 * `ErrorUtils` is a React Native global. This suite runs in node, so it stands
 * up a minimal stand-in with the same two methods.
 */
function stubErrorUtils(initial: Handler): { current: () => Handler } {
  let handler = initial;
  (globalThis as unknown as { ErrorUtils: unknown }).ErrorUtils = {
    getGlobalHandler: () => handler,
    setGlobalHandler: (next: Handler) => {
      handler = next;
    },
  };
  return { current: () => handler };
}

let original: Handler;
let installed: { current: () => Handler };

beforeEach(() => {
  original = vi.fn();
  installed = stubErrorUtils(original);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as unknown as { ErrorUtils?: unknown }).ErrorUtils;
});

describe("formatGlobalError", () => {
  it("renders a greppable single line with name, message and a truncated stack", () => {
    const error = new Error("boom");
    error.name = "RangeError";
    error.stack = Array.from({ length: 12 }, (_, i) => `frame${i}`).join("\n");

    const line = formatGlobalError(error, true);

    expect(line).toBe(
      "DRAGONS_JS_ERROR fatal=true name=RangeError msg=boom stack=" +
        "frame0 | frame1 | frame2 | frame3 | frame4 | frame5 | frame6 | frame7",
    );
    expect(line.split("\n")).toHaveLength(1);
  });

  it("survives a thrown value that is not an Error", () => {
    expect(formatGlobalError("just a string", false)).toContain(
      "DRAGONS_JS_ERROR fatal=false",
    );
  });
});

describe("installGlobalErrorHandler", () => {
  it("logs the error and still calls the handler it replaced", () => {
    installGlobalErrorHandler();
    const error = new Error("boom");

    installed.current()(error, true);

    expect(console.warn).toHaveBeenCalledWith(formatGlobalError(error, true));
    expect(original).toHaveBeenCalledWith(error, true);
  });

  it("restores the previous handler when uninstalled", () => {
    const uninstall = installGlobalErrorHandler();

    uninstall();

    expect(installed.current()).toBe(original);
  });

  // Fast refresh re-runs the effect: cleanup, then install again. Without the
  // restore step each cycle wrapped the previous wrapper, so one error was
  // logged once per refresh since app start.
  it("does not chain handlers across repeated install/uninstall cycles", () => {
    for (let i = 0; i < 5; i++) installGlobalErrorHandler()();
    installGlobalErrorHandler();

    installed.current()(new Error("boom"), false);

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(original).toHaveBeenCalledTimes(1);
  });
});
