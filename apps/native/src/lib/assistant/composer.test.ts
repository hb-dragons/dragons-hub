import { describe, expect, it } from "vitest";
import {
  clampComposerHeight,
  composerButtonState,
  COMPOSER_MIN,
  COMPOSER_MAX,
} from "./composer";

describe("clampComposerHeight", () => {
  it("returns the min for heights below the floor", () => {
    expect(clampComposerHeight(10)).toBe(COMPOSER_MIN);
  });
  it("returns the max for heights above the cap", () => {
    expect(clampComposerHeight(500)).toBe(COMPOSER_MAX);
  });
  it("passes through heights in range", () => {
    expect(clampComposerHeight(80)).toBe(80);
  });
  it("falls back to the min for non-finite readings", () => {
    expect(clampComposerHeight(Number.NaN)).toBe(COMPOSER_MIN);
    expect(clampComposerHeight(Number.POSITIVE_INFINITY)).toBe(COMPOSER_MIN);
  });
  it("honours custom bounds", () => {
    expect(clampComposerHeight(5, 12, 100)).toBe(12);
    expect(clampComposerHeight(200, 12, 100)).toBe(100);
  });
});

describe("composerButtonState", () => {
  it("is stop while busy, regardless of text", () => {
    expect(composerButtonState(true, "")).toBe("stop");
    expect(composerButtonState(true, "hello")).toBe("stop");
  });
  it("is disabled when not busy and the trimmed value is empty", () => {
    expect(composerButtonState(false, "")).toBe("disabled");
    expect(composerButtonState(false, "   ")).toBe("disabled");
  });
  it("is send when not busy and there is text", () => {
    expect(composerButtonState(false, "hi")).toBe("send");
  });
});
