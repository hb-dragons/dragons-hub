import { beforeEach, describe, expect, it, vi } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: (...a: unknown[]) => getItem(...a), setItem: (...a: unknown[]) => setItem(...a) },
}));

import { localStorage } from "@/lib/local-storage";

describe("localStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getItem delegates to AsyncStorage.getItem", async () => {
    getItem.mockResolvedValue("stored-value");
    const result = await localStorage.getItem("theme_mode");
    expect(result).toBe("stored-value");
    expect(getItem).toHaveBeenCalledWith("theme_mode");
  });

  it("setItem delegates to AsyncStorage.setItem", async () => {
    setItem.mockResolvedValue(undefined);
    await localStorage.setItem("theme_mode", "dark");
    expect(setItem).toHaveBeenCalledWith("theme_mode", "dark");
  });
});
