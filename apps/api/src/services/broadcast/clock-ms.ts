/**
 * Whole milliseconds remaining on the game clock, recovered from the decoded
 * display text. `clockSeconds` is floored to whole seconds by the decoder, so
 * the sub-minute tenths only survive in `clockText` ("SS.t"). Used to seed the
 * overlay's client-side interpolation; derived here so no DB column or decoder
 * change is needed.
 */
export function deriveClockMs(
  clockText: string,
  clockSeconds: number | null,
): number | null {
  if (clockText.includes(":")) {
    const [mm, ss] = clockText.split(":");
    const m = Number(mm);
    const s = Number(ss);
    if (Number.isFinite(m) && Number.isFinite(s)) return (m * 60 + s) * 1000;
  } else if (clockText.includes(".")) {
    // Sub-minute "SS.t". Parse as a decimal so the result is correct
    // regardless of how many fractional digits the panel emits.
    const value = Number(clockText);
    if (Number.isFinite(value)) return Math.round(value * 1000);
  }
  return clockSeconds != null ? clockSeconds * 1000 : null;
}
