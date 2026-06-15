import { describe, expect, it } from "vitest";
import { pickDisplayText } from "./stream-throttle";

describe("pickDisplayText", () => {
  it("shows the full text immediately when not streaming", () => {
    expect(pickDisplayText({ full: "done", shown: "do", isStreaming: false, elapsedMs: 0 })).toBe("done");
  });
  it("holds the shown text within the throttle interval", () => {
    expect(pickDisplayText({ full: "hello wor", shown: "hello", isStreaming: true, elapsedMs: 40 })).toBe("hello");
  });
  it("flushes once the interval has elapsed", () => {
    expect(pickDisplayText({ full: "hello world", shown: "hello", isStreaming: true, elapsedMs: 120 })).toBe("hello world");
  });
  it("flushes early when a new block boundary completes", () => {
    expect(pickDisplayText({ full: "para one\n\npara two", shown: "para one", isStreaming: true, elapsedMs: 10 })).toBe("para one\n\npara two");
  });
});
