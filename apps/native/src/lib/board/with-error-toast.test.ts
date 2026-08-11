import { beforeEach, describe, expect, it, vi } from "vitest";

const error = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptics: { error: (...a: unknown[]) => error(...a) } }));
vi.mock("@/lib/i18n", () => ({
  i18n: { t: (k: string) => `translated:${k}` },
}));

import { withErrorToast } from "@/lib/board/with-error-toast";

describe("withErrorToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fn's result and shows no toast on success", async () => {
    const toast = { show: vi.fn() };
    const result = await withErrorToast(() => Promise.resolve("ok"), "toast.saveFailed", toast);
    expect(result).toBe("ok");
    expect(toast.show).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("fires an error haptic, shows the failKey's toast, and rethrows on failure", async () => {
    const toast = { show: vi.fn() };
    const boom = new Error("boom");

    await expect(
      withErrorToast(() => Promise.reject(boom), "toast.deleteFailed", toast),
    ).rejects.toBe(boom);

    expect(error).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith({
      title: "translated:toast.deleteFailed",
      variant: "error",
    });
  });

  it("uses the failKey passed by the caller, not a hardcoded key", async () => {
    const toast = { show: vi.fn() };
    await expect(
      withErrorToast(() => Promise.reject(new Error("x")), "toast.createFailed", toast),
    ).rejects.toThrow("x");

    expect(toast.show).toHaveBeenCalledWith({
      title: "translated:toast.createFailed",
      variant: "error",
    });
  });
});
