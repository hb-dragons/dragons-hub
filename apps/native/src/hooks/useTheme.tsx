import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { ThemeProvider as NavigationThemeProvider } from "expo-router";
import { colors } from "@/theme/colors";
import { textStyles } from "@/theme/typography";
import { spacing, radius } from "@/theme/spacing";
import { buildNavigationTheme } from "@/theme/navigation-theme";
import type { ColorToken } from "@/theme/colors";
import { useAppearanceMode, type Mode } from "./useAppearanceMode";
import { useLocaleSubscription } from "./useLocale";

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
  // Locale subscription, not a theme concern — but a load-bearing one.
  //
  // `LocaleProvider` used to remount its whole subtree (`key={locale}`) so that
  // components re-read `i18n.t(...)`, which reset navigation state. Dropping
  // the remount is only safe if the components rendering translated text
  // actually re-render: React Navigation wraps each screen in a
  // `StaticContainer` that bails out unless its route/navigation props change,
  // so a re-render of the navigator alone does not reach screen bodies. A
  // context subscription does — React propagates context changes through
  // bailed-out subtrees to find consumers.
  //
  // Every themed component in this app calls `useTheme()`, so subscribing here
  // gives exactly the set of components that render UI, with one line instead
  // of a `t()` migration across every screen.
  useLocaleSubscription();

  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
