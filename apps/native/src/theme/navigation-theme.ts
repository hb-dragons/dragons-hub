import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";
import { colors } from "./colors";
import { fontFamilies } from "./typography";

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
    fonts: {
      regular: { fontFamily: fontFamilies.body, fontWeight: "400" },
      medium: { fontFamily: fontFamilies.bodyMedium, fontWeight: "500" },
      bold: { fontFamily: fontFamilies.bodySemiBold, fontWeight: "600" },
      heavy: { fontFamily: fontFamilies.display, fontWeight: "700" },
    },
  };
}
