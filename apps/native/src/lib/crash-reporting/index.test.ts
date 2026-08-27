import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const captureException = vi.fn();
const getClient = vi.fn<() => object | undefined>(() => ({}));

vi.mock("@sentry/react-native", () => ({
  init: (...args: unknown[]) => init(...args),
  captureException: (...args: unknown[]) => captureException(...args),
  getClient: () => getClient(),
}));

vi.mock("expo-updates", () => ({
  get channel() {
    return channel;
  },
}));

let channel: string | null = "production";

import { initCrashReporting, reportCrash } from "@/lib/crash-reporting";

const DSN = "https://key@eu.glitchtip.com/334";

beforeEach(() => {
  channel = "production";
  process.env.EXPO_PUBLIC_GLITCHTIP_DSN = DSN;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.EXPO_PUBLIC_GLITCHTIP_DSN;
});

describe("initCrashReporting", () => {
  it("starts the SDK with the resolved options", () => {
    initCrashReporting();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: DSN, environment: "production" }),
    );
  });

  // The DSN is an EAS secret, so every local bundle and every CI build has
  // none. Opening a socket to GlitchTip from a developer's simulator would
  // burn the free-tier event budget on errors nobody shipped.
  it("does not start the SDK when no DSN is configured", () => {
    delete process.env.EXPO_PUBLIC_GLITCHTIP_DSN;

    initCrashReporting();

    expect(init).not.toHaveBeenCalled();
  });

  // Expo Go and a stale prebuild both have no native module to start.
  it("survives an SDK that throws on start", () => {
    init.mockImplementationOnce(() => {
      throw new Error("native module missing");
    });

    expect(() => initCrashReporting()).not.toThrow();
  });
});

describe("reportCrash", () => {
  // Not fatal: a boundary caught it, so the fallback rendered and the app
  // is still running. Fatals are the SDK's own handler's to file.
  it("sends the error tagged with its source, at error level", () => {
    const error = new Error("boom");

    reportCrash(error, { source: "error-boundary" });

    expect(captureException).toHaveBeenCalledWith(error, {
      level: "error",
      tags: { source: "error-boundary" },
      contexts: {},
    });
  });

  // Sentry's own boundary integration reads `contexts.react.componentStack`,
  // and GlitchTip renders it, so the tree that threw shows up next to the
  // stack instead of only in the NSLog line.
  it("attaches the component stack an error boundary caught", () => {
    reportCrash(new Error("boom"), {
      source: "error-boundary",
      componentStack: "<Screen>\n<Row>",
    });

    expect(captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contexts: { react: { componentStack: "<Screen>\n<Row>" } },
      }),
    );
  });

  it("does nothing when the SDK was never started", () => {
    getClient.mockReturnValueOnce(undefined);

    reportCrash(new Error("boom"), { source: "error-boundary" });

    expect(captureException).not.toHaveBeenCalled();
  });

  it("swallows a capture that throws so it never masks the original error", () => {
    captureException.mockImplementationOnce(() => {
      throw new Error("transport is dead");
    });

    expect(() => reportCrash(new Error("boom"), { source: "error-boundary" })).not.toThrow();
  });
});
