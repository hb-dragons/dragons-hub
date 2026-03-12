import { PostLayout, type MatchRow } from "./shared";
import { DEFAULT_THEME, type PostTheme } from "./theme";

interface Props { calendarWeek: number; matches: MatchRow[]; footer: string; theme?: PostTheme; }

export function WeekendResults({ calendarWeek, matches, footer, theme }: Props) {
  const t = theme ?? DEFAULT_THEME;
  return (
    <PostLayout
      title="ERGEBNISSE"
      subtitle={`KALENDERWOCHE ${calendarWeek}`}
      matches={matches}
      footer={footer}
      theme={t}
      renderMatchDetail={(match) => (
        <div style={{ display: "flex", fontSize: t.matchFontSize, fontWeight: 700 }}>{`| ${match.homeScore}:${match.guestScore}`}</div>
      )}
    />
  );
}
