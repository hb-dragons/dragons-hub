/**
 * Selectable colour swatches for a board column (add/edit column sheets).
 * `null` is the "no colour" option. Unrelated to `@dragons/shared`'s
 * team-badge `COLOR_PRESETS` — this set is board-column specific.
 */
export const COLUMN_COLOR_PRESETS = [
  null,
  "#9ca3af",
  "#34d399",
  "#60a5fa",
  "#f59e0b",
  "#ef4444",
  "#a78bfa",
  "#f472b6",
] as const;


type ColumnColorPreset = (typeof COLUMN_COLOR_PRESETS)[number];

/**
 * i18n key naming each swatch for VoiceOver/TalkBack. A swatch draws no text,
 * so without a name the picker reads as eight unlabelled radio buttons.
 */
const COLUMN_COLOR_LABEL_KEYS: Record<Exclude<ColumnColorPreset, null>, string> = {
  "#9ca3af": "a11y.columnColor.gray",
  "#34d399": "a11y.columnColor.green",
  "#60a5fa": "a11y.columnColor.blue",
  "#f59e0b": "a11y.columnColor.amber",
  "#ef4444": "a11y.columnColor.red",
  "#a78bfa": "a11y.columnColor.violet",
  "#f472b6": "a11y.columnColor.pink",
};

/** The i18n key of a swatch's spoken name; `null` is the "no colour" swatch. */
export function columnColorLabelKey(preset: ColumnColorPreset): string {
  return preset === null ? "a11y.columnColor.none" : COLUMN_COLOR_LABEL_KEYS[preset];
}
