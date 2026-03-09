import type { MatchListItem } from "@dragons/shared";
import { MatchCard } from "./match-card";

interface MatchListProps {
  matches: MatchListItem[];
  formatDate: (date: string) => string;
  translations: {
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
    noMatchesThisWeekend: string;
  };
}

function groupByDate(matches: MatchListItem[]): Map<string, MatchListItem[]> {
  const groups = new Map<string, MatchListItem[]>();
  for (const match of matches) {
    const key = match.kickoffDate ?? "unknown";
    const group = groups.get(key) ?? [];
    group.push(match);
    groups.set(key, group);
  }
  return groups;
}

export function MatchList({ matches, formatDate, translations }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">{translations.noMatchesThisWeekend}</p>
      </div>
    );
  }

  const grouped = groupByDate(matches);

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([date, dayMatches]) => (
        <section key={date}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {date !== "unknown" ? formatDate(date) : "\u2014"}
          </h2>
          <div className="space-y-2">
            {dayMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                translations={translations}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
