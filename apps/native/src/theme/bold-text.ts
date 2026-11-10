/**
 * iOS "Bold Text" for the brand font.
 *
 * The system font turns bold on its own when the setting is on; Bricolage
 * Grotesque ships as static instances (see typography.ts), so content text
 * would stay at its weight. The theme swaps families instead: every weight
 * steps up one file, which puts Regular and Medium content text on SemiBold
 * and keeps the emphasis ladder (an own-club name in SemiBold next to an
 * opponent in Regular) visible by moving SemiBold to Bold.
 *
 * Kept free of typography.ts for the same reason font-families.ts is: tests
 * can import it without the .ttf require()s.
 */
import { fontFamilies } from "./font-families";

export type FontFamilyName = (typeof fontFamilies)[keyof typeof fontFamilies];
export type FontFamilies = Record<keyof typeof fontFamilies, FontFamilyName>;

const BOLD_TEXT_STEP: Record<FontFamilyName, FontFamilyName> = {
  "BricolageGrotesque-Regular": "BricolageGrotesque-SemiBold",
  "BricolageGrotesque-Medium": "BricolageGrotesque-SemiBold",
  "BricolageGrotesque-SemiBold": "BricolageGrotesque-Bold",
  "BricolageGrotesque-Bold": "BricolageGrotesque-Bold",
};

/** The family a piece of content text renders in, given the Bold Text setting. */
export function boldTextFamily(family: FontFamilyName, boldText: boolean): FontFamilyName {
  return boldText ? BOLD_TEXT_STEP[family] : family;
}

/** The semantic family table the theme hands out. */
export function resolveFontFamilies(boldText: boolean): FontFamilies {
  if (!boldText) return fontFamilies;
  const resolved = {} as FontFamilies;
  for (const key of Object.keys(fontFamilies) as (keyof typeof fontFamilies)[]) {
    resolved[key] = boldTextFamily(fontFamilies[key], true);
  }
  return resolved;
}

type WithFamily = { fontFamily: FontFamilyName };
export type ResolvedTextStyles<T extends Record<string, WithFamily>> = {
  [K in keyof T]: Omit<T[K], "fontFamily"> & { fontFamily: FontFamilyName };
};

/** The text style tokens with each family resolved for the Bold Text setting. */
export function resolveTextStyles<T extends Record<string, WithFamily>>(
  styles: T,
  boldText: boolean,
): ResolvedTextStyles<T> {
  if (!boldText) return styles;
  const resolved = {} as Record<string, WithFamily>;
  for (const [name, style] of Object.entries(styles)) {
    resolved[name] = { ...style, fontFamily: boldTextFamily(style.fontFamily, true) };
  }
  return resolved as ResolvedTextStyles<T>;
}
