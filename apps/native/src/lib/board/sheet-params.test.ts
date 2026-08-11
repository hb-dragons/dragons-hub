import { describe, expect, it } from "vitest";

import {
  SORT_MODES,
  formatIdList,
  parseIdSet,
  parseNumericParam,
  parsePriority,
  parseSortMode,
} from "@/lib/board/sheet-params";

/**
 * Route params reach a sheet as strings (or as string arrays, when expo-router
 * sees a repeated key) and can be missing entirely — a sheet opened from a
 * stale deep link gets whatever the URL held. Every sheet route reads its
 * params through these, so none of them has to restate the fallback.
 */

describe("sheet route params", () => {
  describe("parseSortMode", () => {
    it.each(SORT_MODES)("accepts %s", (mode) => {
      expect(parseSortMode(mode)).toBe(mode);
    });

    it("falls back to position for a missing or unknown mode", () => {
      expect(parseSortMode(undefined)).toBe("position");
      expect(parseSortMode("by-vibes")).toBe("position");
    });
  });

  describe("parsePriority", () => {
    it.each(["low", "normal", "high", "urgent"] as const)("accepts %s", (priority) => {
      expect(parsePriority(priority)).toBe(priority);
    });

    it("falls back to normal for a missing or unknown priority", () => {
      expect(parsePriority(undefined)).toBe("normal");
      expect(parsePriority("critical")).toBe("normal");
    });
  });

  describe("id lists", () => {
    it("round-trips a selection through the param", () => {
      const ids = new Set(["u1", "u2"]);
      expect(parseIdSet(formatIdList(ids))).toEqual(ids);
    });

    it("reads an empty or missing param as an empty selection", () => {
      expect(parseIdSet("")).toEqual(new Set());
      expect(parseIdSet(undefined)).toEqual(new Set());
    });

    // `"".split(",")` is `[""]`, so a stray comma would otherwise select a
    // user whose id is the empty string and show a phantom "1 selected".
    it("drops empty segments from a ragged param", () => {
      expect(parseIdSet(",u1,,u2,")).toEqual(new Set(["u1", "u2"]));
    });

    it("formats an empty selection as an empty string", () => {
      expect(formatIdList([])).toBe("");
    });
  });

  describe("parseNumericParam", () => {
    it("reads a numeric id", () => {
      expect(parseNumericParam("42")).toBe(42);
    });

    // A sheet with no id has nothing to act on; it must render its empty state
    // rather than issue requests against board 0 or board NaN.
    it("returns null for a missing or non-numeric id", () => {
      expect(parseNumericParam(undefined)).toBeNull();
      expect(parseNumericParam("")).toBeNull();
      expect(parseNumericParam("seven")).toBeNull();
    });
  });

  // expo-router types every param as `string | string[]`: a key repeated in the
  // URL arrives as an array. Take the first value rather than stringifying the
  // array into "a,b".
  describe("repeated params", () => {
    it("uses the first value of an array param", () => {
      expect(parseSortMode(["due-asc", "due-desc"])).toBe("due-asc");
      expect(parsePriority(["high"])).toBe("high");
      expect(parseNumericParam(["7", "8"])).toBe(7);
      expect(parseIdSet(["u1,u2"])).toEqual(new Set(["u1", "u2"]));
    });

    it("falls back when an array param is empty", () => {
      expect(parseSortMode([])).toBe("position");
      expect(parseNumericParam([])).toBeNull();
    });
  });
});
