import { PostLayout, type MatchRow } from "./shared";

interface Props { calendarWeek: number; matches: MatchRow[]; footer: string; }

export function WeekendResults({ calendarWeek, matches, footer }: Props) {
  return (
    <PostLayout
      title="ERGEBNISSE"
      subtitle={`KALENDERWOCHE ${calendarWeek}`}
      matches={matches}
      footer={footer}
      renderMatchDetail={(match) => (
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>{`| ${match.homeScore}:${match.guestScore}`}</div>
      )}
    />
  );
}
