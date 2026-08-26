// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_NOTICE_KEY,
  acknowledgeAiNotice,
  readAiNoticeAcknowledged,
  resolveNoticeState,
} from "./ai-notice";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("resolveNoticeState", () => {
  it("is pending until the stored flag has been read", () => {
    expect(resolveNoticeState({ loaded: false, acknowledged: false })).toBe("pending");
    expect(resolveNoticeState({ loaded: false, acknowledged: true })).toBe("pending");
  });

  it("shows the notice once loaded and not yet acknowledged", () => {
    expect(resolveNoticeState({ loaded: true, acknowledged: false })).toBe("show");
  });

  it("hides the notice once acknowledged", () => {
    expect(resolveNoticeState({ loaded: true, acknowledged: true })).toBe("hidden");
  });
});

describe("readAiNoticeAcknowledged", () => {
  it("is false in a fresh browser", () => {
    expect(readAiNoticeAcknowledged()).toBe(false);
  });

  it("is true after acknowledgeAiNotice persisted the flag", () => {
    acknowledgeAiNotice();
    expect(readAiNoticeAcknowledged()).toBe(true);
    expect(window.localStorage.getItem(AI_NOTICE_KEY)).toBe("1");
  });

  it("uses the same storage key as the native app (ADR 0005)", () => {
    expect(AI_NOTICE_KEY).toBe("assistant_ai_notice_ack");
  });

  it("treats a storage that throws on read as not acknowledged", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readAiNoticeAcknowledged()).toBe(false);
  });

  it("swallows a storage that throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => acknowledgeAiNotice()).not.toThrow();
  });
});
