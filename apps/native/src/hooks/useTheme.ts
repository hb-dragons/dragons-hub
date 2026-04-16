import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import { useColorScheme } from "react-native";
import type { ReactNode } from "react";
import { createElement } from "react";
import { colors } from "@/theme/colors";
import { textStyles } from "@/theme/typography";
import { spacing, radius } from "@/theme/spacing";
import type { ColorScheme, ColorToken } from "@/theme/colors";

type Mode = "system" | ColorScheme;

/** Resolved color map — values are hex strings from either light or dark palette */
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
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<Mode>("system");

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
  }, []);

  const isDark = mode === "system" ? systemScheme === "dark" : mode === "dark";

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark ? colors.dark : colors.light,
      textStyles,
      spacing,
      radius,
      isDark,
      mode,
      setMode,
    }),
    [isDark, mode, setMode],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
