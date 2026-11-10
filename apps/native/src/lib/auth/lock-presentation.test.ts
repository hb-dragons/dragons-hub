import { describe, expect, it } from "vitest";
import { lockPresentation, lockRoutePush, type LockPresentationInput } from "./lock-presentation";

const base: LockPresentationInput = {
  gateReady: true,
  locked: false,
  authFailed: false,
  revealed: false,
};

describe("lockPresentation", () => {
  it("keeps the splash up until every guard has settled", () => {
    expect(lockPresentation({ ...base, gateReady: false })).toBe("splash");
    expect(lockPresentation({ ...base, gateReady: false, locked: true })).toBe("splash");
  });

  it("shows the app when unlocked", () => {
    expect(lockPresentation(base)).toBe("app");
    expect(lockPresentation({ ...base, revealed: true })).toBe("app");
  });

  describe("cold start with the lock on", () => {
    it("keeps the splash over the mounted app while the system prompt runs", () => {
      // No frame of content before the lock is definitive.
      expect(lockPresentation({ ...base, locked: true })).toBe("splash");
    });

    it("covers the app with the unlock screen once the prompt fails", () => {
      // Nothing can be presented over the app yet, so a root overlay covers it.
      expect(lockPresentation({ ...base, locked: true, authFailed: true })).toBe("overlay");
    });
  });

  describe("relock after the app was shown", () => {
    it("presents the lock as a route over whatever is open, sheets included", () => {
      expect(lockPresentation({ ...base, locked: true, revealed: true })).toBe("route");
      expect(lockPresentation({ ...base, locked: true, revealed: true, authFailed: true })).toBe("route");
    });
  });
});

describe("lockRoutePush", () => {
  it("pushes the lock when a relock arrives", () => {
    expect(lockRoutePush({ present: true, pathname: "/profile", pushedOver: null })).toBe(true);
  });

  it("pushes nothing while unlocked", () => {
    expect(lockRoutePush({ present: false, pathname: "/profile", pushedOver: null })).toBe(false);
  });

  it("does not push twice before the router has moved", () => {
    expect(lockRoutePush({ present: true, pathname: "/profile", pushedOver: "/profile" })).toBe(false);
  });

  it("does nothing while the lock is the top screen", () => {
    expect(lockRoutePush({ present: true, pathname: "/lock", pushedOver: "/profile" })).toBe(false);
  });

  // A notification tap navigates while locked and lands on top of the lock;
  // the lock goes back over it, and unlocking then shows that screen.
  it("presents the lock again over a screen pushed on top of it", () => {
    expect(lockRoutePush({ present: true, pathname: "/referee-game/4", pushedOver: "/profile" })).toBe(true);
  });
});
