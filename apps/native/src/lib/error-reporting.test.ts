import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reportCrash = vi.fn();
vi.mock("@/lib/crash-reporting", () => ({
  reportCrash: (...args: unknown[]) => reportCrash(...args),
}));

import {
  formatBoundaryError,
  formatGlobalError,
  handleBoundaryError,
  installGlobalErrorHandler,
} from "@/lib/error-reporting";

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
/** Call order across the two things the handler does, for the ordering test. */
let order: string[];

beforeEach(() => {
  order = [];
  reportCrash.mockImplementation(() => void order.push("report"));
  original = vi.fn(() => void order.push("previous"));
  installed = stubErrorUtils(original);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  reportCrash.mockReset();
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

  // The SDK's `ReactNativeErrorHandlers` integration has already patched
  // `ErrorUtils` by the time this installs, so `previous` *is* the reporting
  // handler — it captures, flushes, then hands on to RCTFatal. Capturing here
  // as well filed every crash twice.
  it("leaves the fatal report to the handler it wraps", () => {
    installGlobalErrorHandler();

    installed.current()(new Error("boom"), true);

    expect(reportCrash).not.toHaveBeenCalled();
    expect(order).toEqual(["previous"]);
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

describe("handleBoundaryError", () => {
  it("renders a greppable line carrying both the error and the component stack", () => {
    const error = new Error("boom");
    error.name = "TypeError";
    error.stack = "at throwHere";

    const line = formatBoundaryError(error, "at <Screen>\nat <Row>");

    expect(line).toBe(
      "DRAGONS_JS_ERROR boundary=root name=TypeError msg=boom " +
        "stack=at throwHere component=at <Screen> | at <Row>",
    );
  });

  it("reports at error level with the component stack, and logs the same line", () => {
    const error = new Error("boom");

    handleBoundaryError(error, "at <Screen>");

    // Not fatal: React has unmounted the tree and the fallback renders, so
    // the app is still alive and the user can retry.
    expect(reportCrash).toHaveBeenCalledWith(error, {
      source: "error-boundary",
      componentStack: "at <Screen>",
    });
    expect(order).toEqual(["report"]);
    expect(console.warn).toHaveBeenCalledWith(formatBoundaryError(error, "at <Screen>"));
  });

  it("survives React handing it no component stack", () => {
    expect(() => handleBoundaryError(new Error("boom"), null)).not.toThrow();
  });
});
