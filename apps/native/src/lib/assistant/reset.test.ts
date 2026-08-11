import { describe, expect, it, vi } from "vitest";
import { resetChat, shouldOfferReset } from "./reset";

describe("resetChat", () => {
  it("drops the transcript", () => {
    const setMessages = vi.fn();
    const clearError = vi.fn();
    resetChat({ setMessages, clearError });
    expect(setMessages).toHaveBeenCalledWith([]);
  });

  // AI SDK v6 parks the chat in `status: "error"` and keeps `error` set after a
  // failed turn. Emptying `messages` alone leaves the screen showing an error
  // banner for a conversation that no longer exists, so the reset is only a
  // reset if it clears both (issue #148).
  it("clears the error state as well, so the chat leaves status error", () => {
    const setMessages = vi.fn();
    const clearError = vi.fn();
    resetChat({ setMessages, clearError });
    expect(clearError).toHaveBeenCalledTimes(1);
  });

  it("empties the transcript before clearing the error", () => {
    const order: string[] = [];
    resetChat({
      setMessages: () => order.push("setMessages"),
      clearError: () => order.push("clearError"),
    });
    expect(order).toEqual(["setMessages", "clearError"]);
  });
});

describe("shouldOfferReset", () => {
  it("offers the escape hatch once the chat has failed", () => {
    expect(shouldOfferReset({ hasError: true })).toBe(true);
  });

  it("stays out of the way while the chat is healthy", () => {
    expect(shouldOfferReset({ hasError: false })).toBe(false);
  });
});
