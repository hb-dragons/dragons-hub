import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSheetResult,
  deliverSheetResult,
  pendingSheetResultCount,
  releaseSheetResult,
  __resetSheetResultsForTests,
} from "@/lib/nav/sheet-result";

describe("sheet result channel", () => {
  beforeEach(() => {
    __resetSheetResultsForTests();
  });

  it("delivers the value to the handler registered for the token", () => {
    const onResult = vi.fn();
    const token = createSheetResult<string>(onResult);

    expect(deliverSheetResult(token, "due-asc")).toBe(true);
    expect(onResult).toHaveBeenCalledExactlyOnceWith("due-asc");
  });

  it("hands out a distinct token per registration", () => {
    const first = createSheetResult(vi.fn());
    const second = createSheetResult(vi.fn());

    expect(first).not.toBe(second);
  });

  it("routes each token to its own handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    const firstToken = createSheetResult(first);
    const secondToken = createSheetResult(second);

    deliverSheetResult(secondToken, 2);
    deliverSheetResult(firstToken, 1);

    expect(first).toHaveBeenCalledExactlyOnceWith(1);
    expect(second).toHaveBeenCalledExactlyOnceWith(2);
  });

  // A sheet delivers once and then dismisses. Keeping the handler alive would
  // let a second delivery — from a re-render or a double tap on the same row —
  // apply the pick twice.
  it("delivers at most once per token", () => {
    const onResult = vi.fn();
    const token = createSheetResult<number>(onResult);

    expect(deliverSheetResult(token, 1)).toBe(true);
    expect(deliverSheetResult(token, 2)).toBe(false);
    expect(onResult).toHaveBeenCalledExactlyOnceWith(1);
  });

  // The sheet route reads `result` out of route params, where it is optional
  // and always a string. Neither an absent nor a stale token may throw.
  it("ignores a missing or unknown token", () => {
    expect(deliverSheetResult(undefined, "x")).toBe(false);
    expect(deliverSheetResult("", "x")).toBe(false);
    expect(deliverSheetResult("sheet-does-not-exist", "x")).toBe(false);
  });

  // A swipe-dismissed sheet never delivers, so its route unmount hook releases
  // the token instead. Without that the handler — and everything its closure
  // captures — would be retained for the life of the process.
  it("releases a token without invoking its handler", () => {
    const onResult = vi.fn();
    const token = createSheetResult(onResult);

    releaseSheetResult(token);

    expect(deliverSheetResult(token, "x")).toBe(false);
    expect(onResult).not.toHaveBeenCalled();
    expect(pendingSheetResultCount()).toBe(0);
  });

  it("tolerates releasing a missing or already-delivered token", () => {
    const token = createSheetResult(vi.fn());
    deliverSheetResult(token, 1);

    expect(() => {
      releaseSheetResult(token);
      releaseSheetResult(undefined);
    }).not.toThrow();
    expect(pendingSheetResultCount()).toBe(0);
  });

  it("retains only the tokens that are still outstanding", () => {
    createSheetResult(vi.fn());
    const delivered = createSheetResult(vi.fn());
    expect(pendingSheetResultCount()).toBe(2);

    deliverSheetResult(delivered, 1);

    expect(pendingSheetResultCount()).toBe(1);
  });
});
