/**
 * Geometry for `<ClubLogo>`'s two variants.
 *
 * `variant` was declared on the props type but never destructured, so the six
 * call sites passing `variant="chip"` silently rendered plain chrome. The chip
 * variant insets the crest inside a tinted, rounded container while keeping the
 * *outer* footprint identical to `plain`, so swapping variants never shifts
 * surrounding layout.
 */
export type ClubLogoVariant = "plain" | "chip";

export interface ClubLogoMetrics {
  /** Outer box edge length — identical for both variants. */
  boxSize: number;
  /** Edge length of the crest image itself. */
  imageSize: number;
  /** Inset between the box and the crest (0 for `plain`). */
  padding: number;
  borderRadius: number;
  /** Whether to draw the tinted container. */
  chip: boolean;
}

/** Fraction of the box each side of the chip's inset takes. */
const CHIP_INSET_RATIO = 0.125;

export function clubLogoMetrics(
  size: number,
  variant: ClubLogoVariant = "plain",
): ClubLogoMetrics {
  if (variant !== "chip") {
    return {
      boxSize: size,
      imageSize: size,
      padding: 0,
      borderRadius: size / 4,
      chip: false,
    };
  }

  // Round the inset so the crest lands on a whole pixel, and never let it eat
  // the whole box at small sizes.
  const padding = Math.max(1, Math.min(Math.round(size * CHIP_INSET_RATIO), Math.floor((size - 1) / 2)));
  return {
    boxSize: size,
    imageSize: size - 2 * padding,
    padding,
    borderRadius: size / 4,
    chip: true,
  };
}
