import type { Mode } from "@/hooks/useTheme";
import type { LocalePref } from "@/hooks/useLocale";

/**
 * The two preference switchers in Profile, as data (#224).
 *
 * Both used to be rows of hand-styled `Pressable`s — a tinted rectangle per
 * option, its own `StyleSheet`, and the language row written out twice because
 * the signed-out screen offers it too. They are `<Segmented>` now, the same
 * native `UISegmentedControl` the Schedule and Officiating tabs already use, so
 * the selected treatment, the dark-mode rendering and the VoiceOver
 * announcement come from UIKit rather than from three copies of a style.
 *
 * The options live here rather than in the screen for the same reason
 * `lib/board/task-actions.ts` holds the task's: two surfaces offer the language
 * switcher, and a list stated once cannot drift between them.
 *
 * Labels are named by key, not translated here: this module is loaded by tests
 * that have no `i18n` runtime, and the screen already has one. `segmentLabels`
 * is the one-line bridge.
 */
export interface PreferenceSegmentSpec<K extends string> {
  /** The stored preference value this segment selects. */
  key: K;
  /** i18n key of the segment's label. */
  labelKey: string;
}

/** Appearance: follow the system, or pin light/dark. */
export const THEME_SEGMENTS: readonly PreferenceSegmentSpec<Mode>[] = [
  { key: "system", labelKey: "profile.themeSystem" },
  { key: "light", labelKey: "profile.themeLight" },
  { key: "dark", labelKey: "profile.themeDark" },
];

/** Language: follow the device, or pin German/English. */
export const LOCALE_SEGMENTS: readonly PreferenceSegmentSpec<LocalePref>[] = [
  { key: "system", labelKey: "profile.languageSystem" },
  { key: "de", labelKey: "profile.languageDe" },
  { key: "en", labelKey: "profile.languageEn" },
];

/** The specs above in the shape `<Segmented>` takes, with labels translated. */
export function segmentLabels<K extends string>(
  specs: readonly PreferenceSegmentSpec<K>[],
  t: (key: string) => string,
): { key: K; label: string }[] {
  return specs.map((spec) => ({ key: spec.key, label: t(spec.labelKey) }));
}
