import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { ThemeProvider as NavigationThemeProvider } from "expo-router";
import { colors } from "@/theme/colors";
import { textStyles } from "@/theme/typography";
import { spacing, radius } from "@/theme/spacing";
import { buildNavigationTheme } from "@/theme/navigation-theme";
import {
  resolveFontFamilies,
  resolveTextStyles,
  type FontFamilies,
  type ResolvedTextStyles,
} from "@/theme/bold-text";
import type { ColorToken } from "@/theme/colors";
import { useBoldText } from "./useBoldText";
import { useLocaleSubscription } from "./useLocale";

type ResolvedColors = Record<ColorToken, string>;

interface ThemeContextValue {
  colors: ResolvedColors;
  /** Text style tokens, with families resolved for iOS Bold Text. */
  textStyles: ResolvedTextStyles<typeof textStyles>;
  /** Semantic font families, resolved for iOS Bold Text. */
  fontFamilies: FontFamilies;
  /** iOS "Bold Text" is on. */
  boldText: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The app follows the system appearance (#399); there is no in-app override.
  // `useColorScheme` can report null for a moment (e.g. while iOS takes its
  // background snapshots); keep the last known scheme rather than flash light.
  const systemScheme = useColorScheme();
  const lastKnownScheme = useRef<"light" | "dark">(systemScheme === "dark" ? "dark" : "light");
  if (systemScheme === "light" || systemScheme === "dark") lastKnownScheme.current = systemScheme;
  const scheme = lastKnownScheme.current;
  const boldText = useBoldText();

  const navTheme = useMemo(() => buildNavigationTheme(scheme), [scheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: colors[scheme],
      textStyles: resolveTextStyles(textStyles, boldText),
      fontFamilies: resolveFontFamilies(boldText),
      boldText,
      spacing,
      radius,
      isDark: scheme === "dark",
    }),
    [scheme, boldText],
  );

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
