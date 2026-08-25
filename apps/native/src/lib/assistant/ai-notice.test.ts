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
  AI_NOTICE_KEY,
  acknowledgeAiNotice,
  readAiNoticeAcknowledged,
  resolveNoticeState,
} from "@/lib/assistant/ai-notice";

describe("resolveNoticeState", () => {
  it("is pending until storage has been read", () => {
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

describe("ai notice storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the acknowledgement flag", async () => {
    getItem.mockResolvedValue("1");
    expect(await readAiNoticeAcknowledged()).toBe(true);
    expect(getItem).toHaveBeenCalledWith(AI_NOTICE_KEY);
  });

  it("treats anything but the flag as not acknowledged", async () => {
    getItem.mockResolvedValue(null);
    expect(await readAiNoticeAcknowledged()).toBe(false);
  });

  it("treats a storage failure as not acknowledged — one extra notice, never a missing one", async () => {
    getItem.mockRejectedValue(new Error("disk"));
    expect(await readAiNoticeAcknowledged()).toBe(false);
  });

  it("writes the flag on acknowledgement", async () => {
    setItem.mockResolvedValue(undefined);
    await acknowledgeAiNotice();
    expect(setItem).toHaveBeenCalledWith(AI_NOTICE_KEY, "1");
  });
});
