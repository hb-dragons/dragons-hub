import { formatKickoffLong, resolveDateLocale } from "@dragons/shared";
import { i18n } from "@/lib/i18n";

/**
 * The sentence VoiceOver and TalkBack read for a game card.
 *
 * A card left to the platform reads its texts in layout order — "Sa 25.04.
 * 18:30, Dragons, @, Rhein Stars, 75, :, 62, S" — which is digit soup to
 * someone who cannot see the layout (PRE-LAUNCH "Accessibility pass"). Every
 * card that shows a fixture or a result builds its label here instead, so the
 * match list, the result chips and the head-to-head rows say the same thing:
 *
 *   "Dragons 75 vs Rhein Stars 62, final, won, Saturday, 25.04.2026"
 *   "Dragons vs Rhein Stars, Saturday, 25.04.2026 at 18:30"
 *
 * The caller passes the names it already draws, so the spoken name is the one
 * on screen (custom name, short name or federation name, card by card).
 */
export interface MatchA11yInput {
  homeName: string;
  guestName: string;
  homeScore: number | null;
  guestScore: number | null;
  /** `YYYY-MM-DD`, read in the club's timezone. */
  kickoffDate: string;
  /** `HH:MM[:SS]`; spoken only for a game without a result. */
  kickoffTime?: string | null;
  isCancelled?: boolean;
  isForfeited?: boolean;
  /** The side that is ours, for the won/lost word. Omit when neither is. */
  ownSide?: "home" | "guest" | null;
}

/** The slice of `i18n.t` the builder needs, so tests can pass a plain function. */
export type Translate = (key: string, options?: Record<string, string | number>) => string;

/** Pure form of `matchA11yLabel`, with the translator and date locale passed in. */
export function buildMatchA11yLabel(
  match: MatchA11yInput,
  t: Translate,
  dateLocale: string,
): string {
  const { homeName: home, guestName: guest, homeScore, guestScore } = match;
  const hasScore = homeScore !== null && guestScore !== null;

  const parts = [
    hasScore
      ? t("a11y.match.score", { home, homeScore, guest, guestScore })
      : t("a11y.match.fixture", { home, guest }),
  ];

  if (match.isCancelled) {
    parts.push(t("a11y.match.cancelled"));
  } else {
    if (match.isForfeited) parts.push(t("a11y.match.forfeited"));
    else if (hasScore) parts.push(t("a11y.match.final"));
    if (hasScore && match.ownSide && homeScore !== guestScore) {
      const ownScore = match.ownSide === "home" ? homeScore : guestScore;
      const oppScore = match.ownSide === "home" ? guestScore : homeScore;
      parts.push(t(ownScore > oppScore ? "a11y.match.won" : "a11y.match.lost"));
    }
  }

  const day = formatKickoffLong(match.kickoffDate, dateLocale);
  // The time matters while the game is ahead; once it has a result, the day
  // is enough to tell it apart from the others in the list.
  const time = !hasScore && match.kickoffTime ? match.kickoffTime.slice(0, 5) : null;
  parts.push(time ? t("a11y.match.dayAt", { day, time }) : day);

  return parts.join(", ");
}

/** The spoken label for a game card, in the app's current language. */
export function matchA11yLabel(match: MatchA11yInput): string {
  return buildMatchA11yLabel(
    match,
    (key, options) => i18n.t(key, options),
    resolveDateLocale(i18n.locale),
  );
}
