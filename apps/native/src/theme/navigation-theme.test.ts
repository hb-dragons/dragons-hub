import { describe, expect, it, vi } from "vitest";

// Stand-ins for the router's base themes. The shape matches React Navigation's:
// the system font for every weight.
const systemFonts = {
  regular: { fontFamily: "System", fontWeight: "400" },
  medium: { fontFamily: "System", fontWeight: "500" },
  bold: { fontFamily: "System", fontWeight: "600" },
  heavy: { fontFamily: "System", fontWeight: "700" },
};

vi.mock("expo-router", () => ({
  DefaultTheme: { dark: false, colors: {}, fonts: systemFonts },
  DarkTheme: { dark: true, colors: {}, fonts: systemFonts },
}));

const { buildNavigationTheme } = await import("./navigation-theme");

describe("buildNavigationTheme", () => {
  // The native stack reads its title, large title, back title and bar button
  // fonts from `theme.fonts`. Navigation chrome stays in the system font
  // (DESIGN-SYSTEM.md, "Native app"), which also lets iOS Bold Text and
  // Dynamic Type reach it without the theme's family swap.
  it.each(["light", "dark"] as const)("keeps navigation chrome in the system font (%s)", (scheme) => {
    expect(buildNavigationTheme(scheme).fonts).toEqual(systemFonts);
  });

  it("follows the colour scheme", () => {
    expect(buildNavigationTheme("dark").dark).toBe(true);
    expect(buildNavigationTheme("light").dark).toBe(false);
  });
});
