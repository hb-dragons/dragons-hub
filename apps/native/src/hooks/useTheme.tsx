import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { colors } from "@/theme/colors";
import { textStyles } from "@/theme/typography";
import { spacing, radius } from "@/theme/spacing";
import { buildNavigationTheme } from "@/theme/navigation-theme";
import type { ColorToken } from "@/theme/colors";
import { useAppearanceMode, type Mode } from "./useAppearanceMode";

export type { Mode };

type ResolvedColors = Record<ColorToken, string>;

interface ThemeContextValue {
  colors: ResolvedColors;
  textStyles: typeof textStyles;
  spacing: typeof spacing;
  radius: typeof radius;
  isDark: boolean;
  mode: Mode;
  setMode: (mode: Mode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { mode, setMode, scheme, loaded } = useAppearanceMode();

  const navTheme = useMemo(() => buildNavigationTheme(scheme), [scheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: colors[scheme],
      textStyles,
      spacing,
      radius,
      isDark: scheme === "dark",
      mode,
      setMode,
    }),
    [scheme, mode, setMode],
  );

  if (!loaded) return null;

  return (
    <NavigationThemeProvider value={navTheme}>
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    </NavigationThemeProvider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
