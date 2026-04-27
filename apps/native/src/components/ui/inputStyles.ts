import type { TextStyle } from "react-native";
import type { useTheme } from "@/hooks/useTheme";

type Theme = ReturnType<typeof useTheme>;

/**
 * Shared TextInput styles for the board sheets.
 *
 * The hard rule across every flavor: NEVER set `lineHeight` on a TextInput.
 * On iOS, lineHeight applied to a TextInput shifts the placeholder and the
 * typed text downward inside the line box (a long-standing RN/iOS quirk).
 * Vertical breathing room belongs to padding, not lineHeight.
 *
 * Single-line: rely on the default text centering inside the input's
 * intrinsic height. We use symmetric `paddingVertical` so the text sits
 * exactly in the middle of the visible box.
 *
 * Multi-line: text starts at the top via `textAlignVertical: "top"` and
 * symmetric `paddingTop`/`paddingBottom`. `minHeight` controls the resting
 * size; the input grows as the user types.
 */

export interface InputVariantOptions {
  /** Override font size (default 15 for body, 16 for emphasis). */
  fontSize?: number;
  /** Override font weight. */
  fontWeight?: TextStyle["fontWeight"];
  /** Used by single-line variants that want a fixed-height pill. */
  height?: number;
  /** Used by multiline. Default 80. */
  minHeight?: number;
  /** Override the default surface color. */
  backgroundColor?: string;
  /** Render without the inset surface/border (used for inline title fields). */
  bare?: boolean;
}

/** Standard single-line input that lives inside a sheet body. */
export function singleLineInput(
  theme: Theme,
  options: InputVariantOptions = {},
): TextStyle {
  const { colors, spacing, radius } = theme;
  const fontSize = options.fontSize ?? 15;
  const fontWeight = options.fontWeight;
  // Use an explicit `height` (not paddingVertical) for single-line inputs.
  // iOS TextInput vertically centers its content inside an explicit height,
  // which keeps the placeholder and the first typed character on the same
  // baseline. With paddingVertical instead, iOS sometimes renders the
  // placeholder a few pixels below where typed text lands ("placeholder
  // shifted down").
  const base: TextStyle = {
    color: colors.foreground,
    fontSize,
    paddingHorizontal: spacing.md,
    height: options.height ?? 48,
  };
  if (fontWeight) base.fontWeight = fontWeight;
  if (options.bare) return base;
  return {
    ...base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: options.backgroundColor ?? colors.surfaceLow,
  };
}

/** Standard multi-line input that lives inside a sheet body. */
export function multilineInput(
  theme: Theme,
  options: InputVariantOptions = {},
): TextStyle {
  const { colors, spacing, radius } = theme;
  const fontSize = options.fontSize ?? 14;
  const minHeight = options.minHeight ?? 80;
  const base: TextStyle = {
    color: colors.foreground,
    fontSize,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    minHeight,
    textAlignVertical: "top",
  };
  if (options.bare) return base;
  return {
    ...base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: options.backgroundColor ?? colors.surfaceLow,
  };
}
