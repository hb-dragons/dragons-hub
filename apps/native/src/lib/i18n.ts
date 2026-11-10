import { I18n } from "i18n-js";
import { getLocales } from "expo-localization";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";

const i18n = new I18n({ de, en });
const deviceLocale = getLocales()[0]?.languageCode ?? "de";
i18n.locale = deviceLocale === "de" ? "de" : "en";
i18n.defaultLocale = "de";
i18n.enableFallback = true;

/** `i18n.t` as a plain function, for helpers that take a translator. */
const translate = (key: string, options?: Record<string, string>): string => i18n.t(key, options);

export { i18n, translate };
