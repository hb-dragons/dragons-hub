import { beforeEach, describe, expect, it, vi } from "vitest";

type AppStateListener = (state: string) => void;
type NetworkListener = (state: { isConnected?: boolean }) => void;

let currentAppState = "active";
let appStateListener: AppStateListener | null = null;
const appStateRemoveSpy = vi.fn();

let networkListener: NetworkListener | null = null;
const networkRemoveSpy = vi.fn();

vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return currentAppState;
    },
    addEventListener: vi.fn((event: string, listener: AppStateListener) => {
      if (event === "change") appStateListener = listener;
      return { remove: appStateRemoveSpy };
    }),
  },
}));

vi.mock("expo-network", () => ({
  addNetworkStateListener: vi.fn((listener: NetworkListener) => {
    networkListener = listener;
    return { remove: networkRemoveSpy };
  }),
}));

import {
  didReturnToForeground,
  initFocusRN,
  initReconnectRN,
  isOnlineRN,
  isVisibleRN,
} from "@/lib/swr-native-adapters";

function emitAppState(state: string) {
  appStateListener?.(state);
}

function emitNetwork(isConnected: boolean) {
  networkListener?.({ isConnected });
}

describe("didReturnToForeground", () => {
  it("is true when coming back to active from inactive or background", () => {
    expect(didReturnToForeground("inactive", "active")).toBe(true);
    expect(didReturnToForeground("background", "active")).toBe(true);
  });

  it("is false when not landing on active, or already active", () => {
    expect(didReturnToForeground("active", "inactive")).toBe(false);
    expect(didReturnToForeground("active", "active")).toBe(false);
  });
});

describe("initFocusRN", () => {
  beforeEach(() => {
    currentAppState = "active";
    appStateListener = null;
    appStateRemoveSpy.mockClear();
  });

  it("fires the callback on returning to the foreground from the background", () => {
    const callback = vi.fn();
    initFocusRN(callback);

    emitAppState("background");
    emitAppState("active");

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires the callback on returning to the foreground from an 'inactive' blip too (freshness has no downside to eager revalidation)", () => {
    const callback = vi.fn();
    initFocusRN(callback);

    emitAppState("inactive");
    emitAppState("active");

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not fire on transitions that never reach active", () => {
    const callback = vi.fn();
    initFocusRN(callback);

    emitAppState("background");
    emitAppState("inactive");

    expect(callback).not.toHaveBeenCalled();
  });

  it("removes the AppState subscription on unsubscribe", () => {
    const unsubscribe = initFocusRN(vi.fn());
    unsubscribe();
    expect(appStateRemoveSpy).toHaveBeenCalledTimes(1);
  });
});

describe("initReconnectRN / isOnlineRN", () => {
  beforeEach(() => {
    networkListener = null;
    networkRemoveSpy.mockClear();
  });

  it("fires the callback when connectivity transitions from offline to online", () => {
    const callback = vi.fn();
    initReconnectRN(callback);

    emitNetwork(false);
    expect(callback).not.toHaveBeenCalled();

    emitNetwork(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not fire again while already online, and updates isOnlineRN() live", () => {
    const callback = vi.fn();
    initReconnectRN(callback);

    // `lastKnownOnline` is module-level state shared across tests in this
    // file; force a known offline baseline before asserting the transition.
    emitNetwork(false);
    callback.mockClear();

    emitNetwork(true);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(isOnlineRN()).toBe(true);

    emitNetwork(false);
    expect(isOnlineRN()).toBe(false);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("removes the network subscription on unsubscribe", () => {
    const unsubscribe = initReconnectRN(vi.fn());
    unsubscribe();
    expect(networkRemoveSpy).toHaveBeenCalledTimes(1);
  });
});

describe("isVisibleRN", () => {
  it("is always true — React Native has no distinct background-tab concept beyond AppState", () => {
    expect(isVisibleRN()).toBe(true);
  });
});
