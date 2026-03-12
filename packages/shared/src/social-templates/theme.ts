export interface PostTheme {
  /** Background color for away match rows */
  awayBgColor: string;
  /** Left border color for away match rows */
  awayBorderColor: string;
  /** Background color for the "AUSW." legend badge */
  awayLegendBgColor: string;
  /** Main text color */
  textColor: string;
  /** Title font size in px (e.g. "SPIELTAG") */
  titleFontSize: number;
  /** Subtitle font size in px (e.g. "KALENDERWOCHE 10") */
  subtitleFontSize: number;
  /** Match team label + detail font size in px */
  matchFontSize: number;
  /** Opponent "vs …" line font size in px */
  opponentFontSize: number;
  /** Legend font size in px */
  legendFontSize: number;
  /** Footer font size in px */
  footerFontSize: number;
}

export const DEFAULT_THEME: PostTheme = {
  awayBgColor: "rgba(249, 115, 22, 0.15)",
  awayBorderColor: "rgba(249, 115, 22, 0.8)",
  awayLegendBgColor: "rgba(249, 115, 22, 0.8)",
  textColor: "white",
  titleFontSize: 80,
  subtitleFontSize: 24,
  matchFontSize: 36,
  opponentFontSize: 24,
  legendFontSize: 20,
  footerFontSize: 14,
};
