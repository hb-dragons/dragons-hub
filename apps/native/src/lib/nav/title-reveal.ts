/**
 * Whether a detail screen's bar should show its title yet.
 *
 * A screen that names itself prominently in its content (team detail's
 * coloured team name beside the crest) leaves the bar title empty while that
 * name is on screen, and shows it once the name has scrolled fully under the
 * bar — the in-content name hands over to the bar instead of appearing twice.
 *
 * - `offsetY`: the list's vertical content offset.
 * - `coveredTop`: how much of the list's top the bar covers. On iOS the
 *   detail header is transparent and floats over the list (so the offset
 *   starts at minus this); on Android it is opaque and covers nothing.
 * - `nameBottom`: where the name block ends, in content coordinates; `null`
 *   until it has been laid out.
 */
export function isTitleRevealed(opts: {
  offsetY: number;
  coveredTop: number;
  nameBottom: number | null;
}): boolean {
  if (opts.nameBottom === null) return false;
  return opts.offsetY + opts.coveredTop >= opts.nameBottom;
}
