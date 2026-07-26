import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "@dragons/api-client";

vi.mock("@/lib/swr-native-adapters", () => ({
  initFocusRN: vi.fn(),
  initReconnectRN: vi.fn(),
  isOnlineRN: vi.fn(() => true),
  isVisibleRN: vi.fn(() => true),
}));

import { swrConfig } from "@/lib/swr-config";
import { initFocusRN, initReconnectRN, isOnlineRN, isVisibleRN } from "@/lib/swr-native-adapters";

describe("swrConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wires the React Native focus/reconnect/visibility/online adapters — SWR's browser defaults are inert in React Native", () => {
    expect(swrConfig.initFocus).toBe(initFocusRN);
    expect(swrConfig.initReconnect).toBe(initReconnectRN);
    expect(swrConfig.isOnline).toBe(isOnlineRN);
    expect(swrConfig.isVisible).toBe(isVisibleRN);
  });

  it("supplies a cache provider so SWR does not fall back to a DOM-dependent default", () => {
    const cache = swrConfig.provider?.(new Map() as never);
    expect(cache).toBeInstanceOf(Map);
  });

  it("does not retry or warn on 4xx client errors", () => {
    const err = new APIError(400, "bad_request", "bad request");
    const shouldRetryOnError = swrConfig.shouldRetryOnError as (err: unknown) => boolean;
    expect(shouldRetryOnError(err)).toBe(false);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    swrConfig.onError?.(err, "key-1", {} as never);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("retries and warns on non-client errors", () => {
    const err = new Error("network down");
    const shouldRetryOnError = swrConfig.shouldRetryOnError as (err: unknown) => boolean;
    expect(shouldRetryOnError(err)).toBe(true);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    swrConfig.onError?.(err, "key-2", {} as never);
    expect(warnSpy).toHaveBeenCalledWith("DRAGONS_SWR_ERROR key=key-2", err);
    warnSpy.mockRestore();
  });
});
