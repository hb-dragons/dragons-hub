import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { localStorage } from "@/lib/local-storage";
import { getLocales } from "expo-localization";
import { i18n } from "@/lib/i18n";

export type LocalePref = "system" | "de" | "en";
export type ResolvedLocale = "de" | "en";

const LOCALE_KEY = "locale_pref";

function isValidPref(value: string | null): value is LocalePref {
  return value === "system" || value === "de" || value === "en";
}

function deviceLocale(): ResolvedLocale {
  const code = getLocales()[0]?.languageCode;
  return code === "de" ? "de" : "en";
}

function resolve(pref: LocalePref): ResolvedLocale {
  return pref === "system" ? deviceLocale() : pref;
}

interface LocaleContextValue {
  pref: LocalePref;
  locale: ResolvedLocale;
  setPref: (next: LocalePref) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LocalePref>("system");
  const [locale, setLocaleState] = useState<ResolvedLocale>(() => resolve("system"));
  const [loaded, setLoaded] = useState(false);

  // `i18n` is a module singleton, so it has to be pushed at the moment the
  // preference changes rather than during render: assigning to it while
  // rendering is a side effect React is free to run twice or discard.
  const apply = useCallback((next: LocalePref) => {
    const resolved = resolve(next);
    i18n.locale = resolved;
    setPrefState(next);
    setLocaleState(resolved);
  }, []);

  useEffect(() => {
    void localStorage.getItem(LOCALE_KEY).then((stored) => {
      apply(isValidPref(stored) ? stored : "system");
      setLoaded(true);
    });
  }, [apply]);

  const setPref = useCallback(
    (next: LocalePref) => {
      apply(next);
      void localStorage.setItem(LOCALE_KEY, next);
    },
    [apply],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ pref, locale, setPref }),
    [pref, locale, setPref],
  );

  if (!loaded) return null;

  // NOTE: children are deliberately NOT wrapped in `key={locale}`. That
  // remounted the entire navigation tree on every locale switch — resetting the
  // back stack, scroll positions and any open sheet — just to make components
  // re-read `i18n.t(...)`. Re-reading only needs a re-render, and React
  // propagates a context change into subtrees that would otherwise bail out, so
  // consumers of this context re-render in place. `useTheme()` subscribes on
  // every themed component's behalf; see the note there.
  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx === null) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}

/**
 * Subscribes the calling component to locale changes without requiring a
 * provider — for components that render translated text but do not otherwise
 * care about the locale value. Returns null outside a `LocaleProvider`.
 */
export function useLocaleSubscription(): ResolvedLocale | null {
  return useContext(LocaleContext)?.locale ?? null;
}
