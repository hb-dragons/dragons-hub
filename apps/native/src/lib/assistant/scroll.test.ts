import { describe, expect, it } from "vitest";
import {
  isNearBottom,
  nextFollowScroll,
  shouldReArmFollow,
  countUserMessages,
  NEAR_BOTTOM,
} from "./scroll";
import type { UiMessageLike } from "./messages";

const msg = (role: string): UiMessageLike => ({ id: `${role}-${Math.random()}`, role, parts: [] });

describe("isNearBottom", () => {
  it("is true when content fits within the viewport", () => {
    expect(isNearBottom({ contentOffsetY: 0, contentHeight: 100, layoutHeight: 600, threshold: NEAR_BOTTOM })).toBe(true);
  });
  it("is true when scrolled to (or past) the bottom", () => {
    expect(isNearBottom({ contentOffsetY: 400, contentHeight: 1000, layoutHeight: 600, threshold: NEAR_BOTTOM })).toBe(true);
  });
  it("is true within the threshold band", () => {
    expect(isNearBottom({ contentOffsetY: 350, contentHeight: 1000, layoutHeight: 600, threshold: NEAR_BOTTOM })).toBe(true);
  });
  it("is false when scrolled up beyond the threshold", () => {
    expect(isNearBottom({ contentOffsetY: 100, contentHeight: 1000, layoutHeight: 600, threshold: NEAR_BOTTOM })).toBe(false);
  });
});

describe("nextFollowScroll", () => {
  it("scrolls when content grew and we are following", () => {
    expect(nextFollowScroll({ prevHeight: 100, nextHeight: 140, autoFollow: true })).toEqual({ scroll: true });
  });
  it("does not scroll when not following", () => {
    expect(nextFollowScroll({ prevHeight: 100, nextHeight: 140, autoFollow: false })).toEqual({ scroll: false });
  });
  it("does not scroll when content shrank or is unchanged", () => {
    expect(nextFollowScroll({ prevHeight: 140, nextHeight: 100, autoFollow: true })).toEqual({ scroll: false });
    expect(nextFollowScroll({ prevHeight: 100, nextHeight: 100, autoFollow: true })).toEqual({ scroll: false });
  });
});

describe("shouldReArmFollow", () => {
  it("re-arms when the user-message count increased", () => {
    expect(shouldReArmFollow(2, 1)).toBe(true);
  });
  it("does not re-arm when the count is unchanged", () => {
    expect(shouldReArmFollow(1, 1)).toBe(false);
  });
});

describe("countUserMessages", () => {
  it("counts only role === 'user' entries", () => {
    expect(countUserMessages([msg("user"), msg("assistant"), msg("user")])).toBe(2);
    expect(countUserMessages([])).toBe(0);
  });
});
