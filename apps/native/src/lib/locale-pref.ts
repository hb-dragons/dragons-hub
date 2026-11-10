export type LocalePref = "system" | "de" | "en";

/**
 * The OS sets the app's language (#399): iOS lists the app's languages on its
 * page in iOS Settings. Android keeps the in-app picker.
 */
export function systemOwnsLanguage(os: string): boolean {
  return os === "ios";
}

function isValidPref(value: string | null): value is LocalePref {
  return value === "system" || value === "de" || value === "en";
}

/**
 * The language preference the app runs with, from what the in-app picker
 * stored (#399).
 *
 * iOS owns the per-app language: the app's page in iOS Settings lists the
 * languages `app.json` declares, and choosing one relaunches the app with it
 * as the device locale. A pick stored by the old in-app picker would override
 * that for good, so on iOS the stored value is ignored and the app follows the
 * system. Android keeps the in-app picker and its stored value.
 */
export function effectiveLocalePref(stored: string | null, os: string): LocalePref {
  if (systemOwnsLanguage(os)) return "system";
  return isValidPref(stored) ? stored : "system";
}
