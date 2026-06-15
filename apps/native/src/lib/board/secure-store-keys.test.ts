import { describe, expect, it } from "vitest";
import {
  boardFiltersKey,
  boardSortKey,
  isPersistableBoardId,
  isValidSecureStoreKey,
  SECURE_STORE_KEY_PATTERN,
} from "@/lib/board/secure-store-keys";

describe("board secure-store keys", () => {
  it("produces SecureStore-legal keys (no colons)", () => {
    // Regression: colon-separated keys threw "Invalid key provided to
    // SecureStore" on iOS.
    for (const id of [1, 42, 9999]) {
      expect(boardFiltersKey(id)).toMatch(SECURE_STORE_KEY_PATTERN);
      expect(boardSortKey(id)).toMatch(SECURE_STORE_KEY_PATTERN);
      expect(boardFiltersKey(id)).not.toContain(":");
      expect(boardSortKey(id)).not.toContain(":");
    }
  });

  it("namespaces filters and sort distinctly per board", () => {
    expect(boardFiltersKey(1)).toBe("board.1.filters");
    expect(boardSortKey(1)).toBe("board.1.sort");
    expect(boardFiltersKey(1)).not.toBe(boardFiltersKey(2));
  });

  it("isValidSecureStoreKey rejects empty and colon keys", () => {
    expect(isValidSecureStoreKey("board.1.filters")).toBe(true);
    expect(isValidSecureStoreKey("")).toBe(false);
    expect(isValidSecureStoreKey("board:1:filters")).toBe(false);
  });

  it("isPersistableBoardId accepts positive integers only", () => {
    expect(isPersistableBoardId(1)).toBe(true);
    expect(isPersistableBoardId(NaN)).toBe(false);
    expect(isPersistableBoardId(0)).toBe(false);
    expect(isPersistableBoardId(-3)).toBe(false);
    expect(isPersistableBoardId(1.5)).toBe(false);
  });
});
