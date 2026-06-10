import { describe, expect, it, vi } from "vitest";
import { createOnceGuard } from "@/lib/auth/once-guard";

describe("createOnceGuard", () => {
  it("runs the action once for concurrent callers, then allows a fresh run", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const guard = createOnceGuard(action);

    await Promise.all([guard(), guard(), guard()]);
    expect(action).toHaveBeenCalledTimes(1);

    await guard();
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight latch even if the action throws", async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const guard = createOnceGuard(action);

    await expect(guard()).rejects.toThrow("boom");
    await guard();
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("propagates rejection to all concurrent callers and calls action once", async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error("shared-boom"));
    const guard = createOnceGuard(action);

    const results = await Promise.allSettled([guard(), guard(), guard()]);
    expect(action).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result.status).toBe("rejected");
    }
  });
});
