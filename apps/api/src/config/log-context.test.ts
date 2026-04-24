import { describe, expect, it } from "vitest";
import { getLogContext, runWithLogContext } from "./log-context";

describe("log-context", () => {
  it("getLogContext returns undefined outside of a run", () => {
    expect(getLogContext()).toBeUndefined();
  });

  it("runWithLogContext exposes the context inside the callback", () => {
    const ctx = { requestId: "r-1", traceId: "t-1" };
    const result = runWithLogContext(ctx, () => getLogContext());
    expect(result).toEqual(ctx);
  });

  it("returns the callback result", () => {
    const value = runWithLogContext({ requestId: "r" }, () => 42);
    expect(value).toBe(42);
  });

  it("context does not leak outside of runWithLogContext", () => {
    runWithLogContext({ requestId: "inside" }, () => {
      expect(getLogContext()).toEqual({ requestId: "inside" });
    });
    expect(getLogContext()).toBeUndefined();
  });

  it("supports nested contexts with inner shadowing outer", () => {
    runWithLogContext({ requestId: "outer" }, () => {
      expect(getLogContext()).toEqual({ requestId: "outer" });
      runWithLogContext({ requestId: "inner" }, () => {
        expect(getLogContext()).toEqual({ requestId: "inner" });
      });
      expect(getLogContext()).toEqual({ requestId: "outer" });
    });
  });

  it("context survives awaited async work", async () => {
    const ctx = { requestId: "async", traceSampled: true };
    const seen = await runWithLogContext(ctx, async () => {
      await Promise.resolve();
      return getLogContext();
    });
    expect(seen).toEqual(ctx);
  });
});
