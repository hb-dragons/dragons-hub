import { beforeEach, describe, expect, it, vi } from "vitest";

const openURL = vi.fn();
const alert = vi.fn();
vi.mock("react-native", () => ({
  Linking: { openURL: (...a: unknown[]) => openURL(...a) },
  Alert: { alert: (...a: unknown[]) => alert(...a) },
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => `t:${key}` } }));

import { openExternal } from "@/lib/legal/open-external";

describe("openExternal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hands the URL to the system handler", async () => {
    openURL.mockResolvedValue(true);
    openExternal("https://hbdragons.de/impressum");
    await Promise.resolve();
    expect(openURL).toHaveBeenCalledWith("https://hbdragons.de/impressum");
    expect(alert).not.toHaveBeenCalled();
  });

  it("surfaces a rejected open as an alert instead of an unhandled rejection", async () => {
    openURL.mockRejectedValue(new Error("no handler"));
    openExternal("mailto:app@hbdragons.de");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(alert).toHaveBeenCalledWith("t:legal.openFailed");
  });
});
