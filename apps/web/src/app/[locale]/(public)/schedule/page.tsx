import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import type { MatchListItem } from "@dragons/shared";
import { Badge } from "@dragons/ui/components/badge";

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

export default async function SchedulePage() {
  const t = await getTranslations("public");
  const data = await fetchAPI<{ items: MatchListItem[] }>(
    "/public/matches?limit=100",
  ).catch(() => ({ items: [] }));

  if (data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">{t("noMatches")}</p>
      </div>
    );
  }

  const grouped = groupByDate(data.items);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("schedule")}</h1>

      {Array.from(grouped.entries()).map(([date, matches]) => (
        <section key={date}>
          <h2 className="sticky top-14 z-10 -mx-4 bg-background/95 backdrop-blur px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
            {date !== "unknown"
              ? new Date(date).toLocaleDateString("de-DE", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "—"}
          </h2>
          <div className="space-y-2 pt-2">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} t={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MatchCard({
  match,
  t,
}: {
  match: MatchListItem;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const hasScore = match.homeScore !== null && match.guestScore !== null;
  const isOwnHome = match.homeIsOwnClub;
  const isOwnGuest = match.guestIsOwnClub;

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* League label */}
      {match.leagueName && (
        <p className="text-xs text-muted-foreground mb-2">{match.leagueName}</p>
      )}

      {/* Teams and score */}
      <div className="flex items-center gap-3">
        <div className="flex-1 text-right">
          <p className={`text-sm font-semibold leading-tight ${isOwnHome ? "text-mint-shade" : ""}`}>
            {match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName}
          </p>
        </div>
        <div className="flex flex-col items-center min-w-[56px]">
          {hasScore ? (
            <span className="text-lg font-bold tabular-nums">
              {match.homeScore} : {match.guestScore}
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              {match.kickoffTime?.slice(0, 5) ?? "—"}
            </span>
          )}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold leading-tight ${isOwnGuest ? "text-mint-shade" : ""}`}>
            {match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName}
          </p>
        </div>
      </div>

      {/* Footer: venue + status badges */}
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-muted-foreground truncate">
          {match.venueNameOverride ?? match.venueName ?? ""}
          {match.venueCity ? `, ${match.venueCity}` : ""}
        </p>
        <div className="flex gap-1.5">
          {match.isCancelled && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {t("matchCancelled")}
            </Badge>
          )}
          {match.isForfeited && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {t("matchForfeited")}
            </Badge>
          )}
        </div>
      </div>

      {/* Public comment */}
      {match.publicComment && (
        <p className="text-xs text-muted-foreground mt-2 italic">
          {match.publicComment}
        </p>
      )}
    </div>
  );
}
