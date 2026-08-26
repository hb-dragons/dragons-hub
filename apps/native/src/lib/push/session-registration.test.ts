import { describe, expect, it, vi } from "vitest";

import { createSessionRegistration } from "@/lib/push/session-registration";

describe("createSessionRegistration", () => {
  it("registers on the first call", async () => {
    const register = vi.fn().mockResolvedValue(true);
    const session = createSessionRegistration(register);
    await session.ensure();
    expect(register).toHaveBeenCalledTimes(1);
  });

  // #253: the foreground listener fires on every return to the app, not just
  // the first one after a Settings visit.
  it("does not call again once the token is registered for this session", async () => {
    const register = vi.fn().mockResolvedValue(true);
    const session = createSessionRegistration(register);
    await session.ensure();
    await session.ensure();
    await session.ensure();
    expect(register).toHaveBeenCalledTimes(1);
  });

  // The Settings-grant path: boot found no permission, the user granted it in
  // iOS Settings, and the next foreground has to register.
  it("keeps trying while registration reports it did nothing", async () => {
    const register = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const session = createSessionRegistration(register);
    await session.ensure();
    await session.ensure();
    await session.ensure();
    expect(register).toHaveBeenCalledTimes(2);
  });

  it("collapses a burst of concurrent calls into one registration", async () => {
    let settle: (value: boolean) => void = () => {};
    const register = vi.fn(() => new Promise<boolean>((resolve) => (settle = resolve)));
    const session = createSessionRegistration(register);
    const calls = [session.ensure(), session.ensure(), session.ensure()];
    settle(true);
    await Promise.all(calls);
    expect(register).toHaveBeenCalledTimes(1);
  });

  // The callers fire this from an AppState listener and cannot await it.
  it("swallows a throw, does not latch, and stays usable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const register = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);
    const session = createSessionRegistration(register);
    await expect(session.ensure()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    await session.ensure();
    await session.ensure();
    expect(register).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
