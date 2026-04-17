import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createElement } from "react";
import * as SecureStore from "expo-secure-store";
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void SecureStore.getItemAsync(LOCALE_KEY).then((stored) => {
      if (isValidPref(stored)) {
        setPrefState(stored);
      }
      setLoaded(true);
    });
  }, []);

  const locale = useMemo(() => resolve(pref), [pref]);

  // Keep the shared i18n instance in sync synchronously so children
  // reading `i18n.t(...)` during render see the current locale.
  i18n.locale = locale;

  const setPref = useCallback((next: LocalePref) => {
    setPrefState(next);
    void SecureStore.setItemAsync(LOCALE_KEY, next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ pref, locale, setPref }),
    [pref, locale, setPref],
  );

  if (!loaded) return null;

  // Remount the subtree when locale flips so components re-read
  // `i18n.t(...)` against the new translations.
  return createElement(
    LocaleContext.Provider,
    { value },
    createElement(Fragment, { key: locale }, children),
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx === null) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}
