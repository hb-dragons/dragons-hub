import { describe, expect, it } from "vitest";
import {
  captureTrace,
  currentTraceparent,
  getLogContext,
  runWithLogContext,
  runWithTrace,
} from "./log-context";

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

const HEX32 = "0123456789abcdef0123456789abcdef";
const HEX16 = "abcdef0123456789";

describe("captureTrace", () => {
  it("returns undefined when there is no trace id", () => {
    expect(captureTrace()).toBeUndefined();
    const captured = runWithLogContext({ requestId: "r" }, () => captureTrace());
    expect(captured).toBeUndefined();
  });

  it("snapshots the active trace fields only", () => {
    const captured = runWithLogContext(
      { requestId: "r", traceId: HEX32, spanId: HEX16, traceSampled: true },
      () => captureTrace(),
    );
    expect(captured).toEqual({
      traceId: HEX32,
      spanId: HEX16,
      traceSampled: true,
    });
  });
});

describe("runWithTrace", () => {
  it("runs fn without a context when the carrier is empty", () => {
    const seen = runWithTrace(undefined, () => getLogContext());
    expect(seen).toBeUndefined();
  });

  it("restores the carrier as the active context", () => {
    const seen = runWithTrace(
      { traceId: HEX32, spanId: HEX16, traceSampled: false },
      () => getLogContext(),
    );
    expect(seen).toEqual({
      traceId: HEX32,
      spanId: HEX16,
      traceSampled: false,
    });
  });
});

describe("currentTraceparent", () => {
  it("returns undefined without a trace", () => {
    expect(currentTraceparent()).toBeUndefined();
  });

  it("returns undefined for a malformed (non-32-hex) trace id", () => {
    const tp = runWithLogContext({ traceId: "not-hex" }, () =>
      currentTraceparent(),
    );
    expect(tp).toBeUndefined();
  });

  it("emits a well-formed traceparent reusing a 16-hex span", () => {
    const tp = runWithLogContext(
      { traceId: HEX32, spanId: HEX16, traceSampled: true },
      () => currentTraceparent(),
    );
    expect(tp).toBe(`00-${HEX32}-${HEX16}-01`);
  });

  it("converts a decimal (Cloud Trace) span id to 16-hex", () => {
    const tp = runWithLogContext(
      { traceId: HEX32, spanId: "255", traceSampled: false },
      () => currentTraceparent(),
    );
    expect(tp).toBe(`00-${HEX32}-00000000000000ff-00`);
  });

  it("mints a random 16-hex span when none is usable", () => {
    const tp = runWithLogContext({ traceId: HEX32 }, () => currentTraceparent());
    expect(tp).toMatch(new RegExp(`^00-${HEX32}-[0-9a-f]{16}-00$`));
  });
});
