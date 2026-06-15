/** One-line resting height of the chat composer (px). */
export const COMPOSER_MIN = 40;
/** Cap before the field scrolls internally (~5-6 lines). */
export const COMPOSER_MAX = 132;

/**
 * Clamp the auto-grow height reported by the TextInput's onContentSizeChange.
 * Guards against iOS returning a bad placeholder-only contentSize: a non-finite
 * reading collapses to the one-line min instead of blowing past the cap.
 */
export function clampComposerHeight(
  contentHeight: number,
  min: number = COMPOSER_MIN,
  max: number = COMPOSER_MAX,
): number {
  if (!Number.isFinite(contentHeight)) return min;
  return Math.max(min, Math.min(max, contentHeight));
}

export type ComposerButtonState = "send" | "stop" | "disabled";

/**
 * Map (busy, input value) to the morphing send-button variant.
 * busy wins over text (stop while generating); empty trimmed input is disabled.
 */
export function composerButtonState(busy: boolean, value: string): ComposerButtonState {
  if (busy) return "stop";
  if (value.trim().length === 0) return "disabled";
  return "send";
}
