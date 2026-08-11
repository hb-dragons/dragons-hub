import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (state: string) => void;

let currentState = "active";
let changeListener: Listener | null = null;
const removeSpy = vi.fn();

vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return currentState;
    },
    addEventListener: vi.fn((event: string, listener: Listener) => {
      if (event === "change") changeListener = listener;
      return { remove: removeSpy };
    }),
  },
}));

import {
  DEFAULT_RELOCK_GRACE_PERIOD_MS,
  didEnterBackground,
  didReturnFromBackground,
  subscribeBackgroundRelock,
} from "@/lib/biometric-relock";

function emit(state: string) {
  changeListener?.(state);
}

describe("didEnterBackground", () => {
  it("is true only when transitioning into background from a non-background state", () => {
    expect(didEnterBackground("active", "background")).toBe(true);
    expect(didEnterBackground("inactive", "background")).toBe(true);
    expect(didEnterBackground("background", "background")).toBe(false);
    expect(didEnterBackground("active", "inactive")).toBe(false);
  });
});

describe("didReturnFromBackground", () => {
  it("is true only for the exact background -> active transition", () => {
    expect(didReturnFromBackground("background", "active")).toBe(true);
    expect(didReturnFromBackground("inactive", "active")).toBe(false);
    expect(didReturnFromBackground("background", "inactive")).toBe(false);
  });
});

describe("subscribeBackgroundRelock", () => {
  beforeEach(() => {
    currentState = "active";
    changeListener = null;
    removeSpy.mockClear();
  });

  it("relocks when the app truly backgrounds and returns (default zero grace period)", () => {
    const onRelock = vi.fn();
    subscribeBackgroundRelock({ onRelock });

    emit("background");
    emit("active");

    expect(onRelock).toHaveBeenCalledTimes(1);
  });

  it("does NOT relock on an iOS 'inactive' blip (app switcher / control center / incoming call) that never reaches background", () => {
    const onRelock = vi.fn();
    subscribeBackgroundRelock({ onRelock });

    emit("inactive");
    emit("active");

    expect(onRelock).not.toHaveBeenCalled();
  });

  it("does NOT relock while still within the configured grace period", () => {
    const onRelock = vi.fn();
    let clock = 0;
    subscribeBackgroundRelock({ onRelock, gracePeriodMs: 10_000, now: () => clock });

    emit("background");
    clock = 5_000;
    emit("active");

    expect(onRelock).not.toHaveBeenCalled();
  });

  it("relocks once elapsed time meets or exceeds the grace period", () => {
    const onRelock = vi.fn();
    let clock = 0;
    subscribeBackgroundRelock({ onRelock, gracePeriodMs: 10_000, now: () => clock });

    emit("background");
    clock = 10_000;
    emit("active");

    expect(onRelock).toHaveBeenCalledTimes(1);
  });

  it("fails closed (relocks) if 'active' arrives from 'background' with no recorded backgrounding timestamp", () => {
    // Simulates the listener attaching after the app was already backgrounded.
    currentState = "background";
    const onRelock = vi.fn();
    subscribeBackgroundRelock({ onRelock, gracePeriodMs: 60_000 });

    emit("active");

    expect(onRelock).toHaveBeenCalledTimes(1);
  });

  it("defaults the grace period to zero — immediate relock", () => {
    expect(DEFAULT_RELOCK_GRACE_PERIOD_MS).toBe(0);
  });

  it("removes the AppState subscription when unsubscribed", () => {
    const unsubscribe = subscribeBackgroundRelock({ onRelock: vi.fn() });
    unsubscribe();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
