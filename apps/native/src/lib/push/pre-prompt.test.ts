import { beforeEach, describe, expect, it, vi } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();
vi.mock("@/lib/local-storage", () => ({
  localStorage: {
    getItem: (...a: unknown[]) => getItem(...a),
    setItem: (...a: unknown[]) => setItem(...a),
  },
}));

import {
  PUSH_PROMPT_DEFERRED_KEY,
  clearPushPromptDeferral,
  decidePushFlow,
  deferPushPrompt,
  pushStatusLabelKey,
  readPushPromptDeferred,
} from "@/lib/push/pre-prompt";

describe("decidePushFlow", () => {
  const base = { isDevice: true, signedIn: true, deferred: false } as const;

  it("registers silently when the OS already granted permission", () => {
    expect(decidePushFlow({ ...base, status: "granted" })).toBe("register");
  });

  it("shows the explanation when the OS has not been asked and the user has not deferred", () => {
    expect(decidePushFlow({ ...base, status: "undetermined" })).toBe("prompt");
  });

  it("stays quiet after a deferral", () => {
    expect(decidePushFlow({ ...base, status: "undetermined", deferred: true })).toBe("none");
  });

  it("stays quiet after a denial — Settings is the only way back", () => {
    expect(decidePushFlow({ ...base, status: "denied" })).toBe("none");
  });

  it("does nothing signed out or on a simulator", () => {
    expect(decidePushFlow({ ...base, status: "granted", signedIn: false })).toBe("none");
    expect(decidePushFlow({ ...base, status: "undetermined", isDevice: false })).toBe("none");
  });
});

describe("deferral storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the deferral flag", async () => {
    getItem.mockResolvedValue("1");
    expect(await readPushPromptDeferred()).toBe(true);
    expect(getItem).toHaveBeenCalledWith(PUSH_PROMPT_DEFERRED_KEY);
  });

  it("treats a missing flag or a storage failure as not deferred", async () => {
    getItem.mockResolvedValue(null);
    expect(await readPushPromptDeferred()).toBe(false);
    getItem.mockRejectedValue(new Error("disk"));
    expect(await readPushPromptDeferred()).toBe(false);
  });

  it("writes and clears the flag", async () => {
    setItem.mockResolvedValue(undefined);
    await deferPushPrompt();
    expect(setItem).toHaveBeenCalledWith(PUSH_PROMPT_DEFERRED_KEY, "1");
    await clearPushPromptDeferral();
    expect(setItem).toHaveBeenCalledWith(PUSH_PROMPT_DEFERRED_KEY, "0");
  });
});

describe("pushStatusLabelKey", () => {
  it("maps every status to a locale key", () => {
    expect(pushStatusLabelKey("granted")).toBe("push.statusGranted");
    expect(pushStatusLabelKey("denied")).toBe("push.statusDenied");
    expect(pushStatusLabelKey("undetermined")).toBe("push.statusUndetermined");
  });
});
