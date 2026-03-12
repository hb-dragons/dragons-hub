import { PostLayout, type MatchRow } from "./shared";

interface Props { calendarWeek: number; matches: MatchRow[]; footer: string; }

export function WeekendPreview({ calendarWeek, matches, footer }: Props) {
  return (
    <PostLayout
      title="SPIELTAG"
      subtitle={`KALENDERWOCHE ${calendarWeek}`}
      matches={matches}
      footer={footer}
      renderMatchDetail={(match) => (
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>{`| ${match.kickoffTime}`}</div>
      )}
    />
  );
}
