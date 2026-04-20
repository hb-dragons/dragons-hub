import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { Appearance, useColorScheme } from "react-native";
import type { ReactNode } from "react";
import { createElement } from "react";
import * as SecureStore from "expo-secure-store";
import { colors } from "@/theme/colors";
import { textStyles } from "@/theme/typography";
import { spacing, radius } from "@/theme/spacing";
import type { ColorScheme, ColorToken } from "@/theme/colors";

export type Mode = "system" | ColorScheme;

const THEME_MODE_KEY = "theme_mode";

function isValidMode(value: string | null): value is Mode {
  return value === "system" || value === "light" || value === "dark";
}

// Push the JS theme choice into the native window's overrideUserInterfaceStyle
// so UITabBar / UINavigationBar chrome + back-chevron tint match immediately,
// with no cross-fade flash on push or tab switch. `unspecified` clears the
// override and lets iOS follow the device setting.
function syncNativeAppearance(mode: Mode) {
  Appearance.setColorScheme(mode === "system" ? "unspecified" : mode);
}

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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void SecureStore.getItemAsync(THEME_MODE_KEY).then((stored) => {
      const resolved: Mode = isValidMode(stored) ? stored : "system";
      syncNativeAppearance(resolved);
      setModeState(resolved);
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback((next: Mode) => {
    syncNativeAppearance(next);
    setModeState(next);
    void SecureStore.setItemAsync(THEME_MODE_KEY, next);
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

  // Avoid flash of wrong theme while loading persisted preference
  if (!loaded) return null;

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
