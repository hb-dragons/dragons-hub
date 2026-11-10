import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { colors } from "./colors";

/**
 * The router theme. Colours come from the brand tokens; fonts stay the base
 * theme's system font, because the native stack draws its titles, large
 * titles, back titles and bar buttons from `theme.fonts`, and navigation
 * chrome is the system's, not the brand's (DESIGN-SYSTEM.md, "Native app").
 * Content takes Bricolage from `useTheme()` instead.
 */
export function buildNavigationTheme(scheme: "light" | "dark"): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const p = colors[scheme];

  return {
    ...base,
    dark: scheme === "dark",
    colors: {
      ...base.colors,
      primary: p.primary,
      background: p.background,
      card: p.surfaceLowest,
      text: p.foreground,
      border: p.border,
      notification: p.destructive,
    },
  };
}
