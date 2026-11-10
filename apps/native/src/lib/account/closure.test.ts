import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertButton } from "@/lib/auth/sign-out-confirm";
import {
  closureRequestedDate,
  closureScreenState,
  confirmAccountClosure,
  isClosureRequested,
} from "./closure";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isClosureRequested", () => {
  it.each([
    [undefined, false],
    [{ request: null }, false],
    [{ request: { requestedAt: "2026-11-10T09:00:00.000Z" } }, true],
  ])("reads %j as %s", (status, expected) => {
    expect(isClosureRequested(status)).toBe(expected);
  });
});

describe("closureRequestedDate", () => {
  it("names the club-zone day, not the device's", () => {
    // 23:30 UTC on the 10th is already the 11th in Berlin; a device in New
    // York must still show the day the club recorded.
    vi.stubEnv("TZ", "America/New_York");
    expect(closureRequestedDate("2026-11-10T23:30:00.000Z", "en")).toBe("Wed, 11.11.2026");
  });

  it("follows the app locale", () => {
    vi.stubEnv("TZ", "UTC");
    expect(closureRequestedDate("2026-11-10T09:00:00.000Z", "de")).toMatch(/^Di\.?, 10\.11\.2026$/);
  });
});

describe("closureScreenState", () => {
  const requested = { request: { requestedAt: "2026-11-10T09:00:00.000Z" } };

  it.each<[string, Parameters<typeof closureScreenState>[0], ReturnType<typeof closureScreenState>]>([
    ["loading before the status arrives", { status: undefined, error: undefined, submitting: false }, "loading"],
    ["failed when the status cannot be read", { status: undefined, error: new Error("x"), submitting: false }, "failed"],
    ["ready with no request on file", { status: { request: null }, error: undefined, submitting: false }, "ready"],
    ["submitting while the request is in flight", { status: { request: null }, error: undefined, submitting: true }, "submitting"],
    ["requested once one is on file", { status: requested, error: undefined, submitting: false }, "requested"],
    ["requested even if a later revalidation failed", { status: requested, error: new Error("x"), submitting: false }, "requested"],
  ])("is %s", (_name, input, expected) => {
    expect(closureScreenState(input)).toBe(expected);
  });
});

describe("confirmAccountClosure", () => {
  const t = (key: string) => key;

  it("asks with a cancel and a destructive button, and requests only on confirm", () => {
    const alert = vi.fn<(title: string, message: string | undefined, buttons: AlertButton[]) => void>();
    const request = vi.fn(async () => {});

    confirmAccountClosure({ alert, request, t });

    expect(request).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0]!;
    expect(title).toBe("profile.closure.confirmTitle");
    expect(message).toBe("profile.closure.confirmMessage");
    expect(buttons.map((b) => b.style)).toEqual(["cancel", "destructive"]);

    buttons[1]!.onPress?.();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
