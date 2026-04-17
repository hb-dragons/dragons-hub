import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations } from "next-intl/server";
import type { LeagueStandings, StandingItem } from "@dragons/shared";
import { cn } from "@dragons/ui/lib/utils";

export default async function StandingsPage() {
  const t = await getTranslations();
  const standings = await getPublicApi().getStandings().catch(() => []);

  if (standings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">{t("public.noStandings")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t("public.standings")}</h1>

      {standings.map((league) => (
        <section key={league.leagueId} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{league.leagueName}</h2>
            <p className="text-xs text-muted-foreground">
              {t("standings.season", { season: league.seasonName })}
            </p>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium w-8">{t("standings.columns.position")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("standings.columns.team")}</th>
                  <th className="px-3 py-2 text-center font-medium w-10">{t("standings.columns.played")}</th>
                  <th className="px-3 py-2 text-center font-medium w-10">{t("standings.columns.won")}</th>
                  <th className="px-3 py-2 text-center font-medium w-10">{t("standings.columns.lost")}</th>
                  <th className="px-3 py-2 text-center font-medium w-14">{t("standings.columns.pointsFor")}</th>
                  <th className="px-3 py-2 text-center font-medium w-14">{t("standings.columns.pointsAgainst")}</th>
                  <th className="px-3 py-2 text-center font-medium w-14">{t("standings.columns.pointsDiff")}</th>
                  <th className="px-3 py-2 text-center font-medium w-12">{t("standings.columns.leaguePoints")}</th>
                </tr>
              </thead>
              <tbody>
                {league.standings.map((row) => (
                  <StandingsRow key={`${league.leagueId}-${row.position}`} row={row} variant="desktop" />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile table */}
          <div className="md:hidden overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-2 text-left font-medium w-8">{t("standings.columns.position")}</th>
                  <th className="px-2 py-2 text-left font-medium">{t("standings.columns.team")}</th>
                  <th className="px-2 py-2 text-center font-medium w-12">W-L</th>
                  <th className="px-2 py-2 text-center font-medium w-10">{t("standings.columns.leaguePoints")}</th>
                </tr>
              </thead>
              <tbody>
                {league.standings.map((row) => (
                  <StandingsRow key={`${league.leagueId}-${row.position}-m`} row={row} variant="mobile" />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function StandingsRow({
  row,
  variant,
}: {
  row: StandingItem;
  variant: "desktop" | "mobile";
}) {
  const isOwn = row.isOwnClub;

  if (variant === "mobile") {
    return (
      <tr className={cn("border-b last:border-0", isOwn && "bg-mint-tint/10")}>
        <td className="px-2 py-2.5 tabular-nums text-muted-foreground">{row.position}</td>
        <td className={cn("px-2 py-2.5 font-medium", isOwn && "text-mint-shade font-semibold")}>
          <span className="block truncate max-w-[160px]">{row.teamNameShort ?? row.teamName}</span>
        </td>
        <td className="px-2 py-2.5 text-center tabular-nums">{row.won}-{row.lost}</td>
        <td className="px-2 py-2.5 text-center font-semibold tabular-nums">{row.leaguePoints}</td>
      </tr>
    );
  }

  return (
    <tr className={cn("border-b last:border-0", isOwn && "bg-mint-tint/10")}>
      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{row.position}</td>
      <td className={cn("px-3 py-2.5 font-medium", isOwn && "text-mint-shade font-semibold")}>
        {row.teamName}
      </td>
      <td className="px-3 py-2.5 text-center tabular-nums">{row.played}</td>
      <td className="px-3 py-2.5 text-center tabular-nums">{row.won}</td>
      <td className="px-3 py-2.5 text-center tabular-nums">{row.lost}</td>
      <td className="px-3 py-2.5 text-center tabular-nums">{row.pointsFor}</td>
      <td className="px-3 py-2.5 text-center tabular-nums">{row.pointsAgainst}</td>
      <td className={cn("px-3 py-2.5 text-center tabular-nums", row.pointsDiff > 0 ? "text-green-600" : row.pointsDiff < 0 ? "text-red-500" : "")}>
        {row.pointsDiff > 0 ? `+${row.pointsDiff}` : row.pointsDiff}
      </td>
      <td className="px-3 py-2.5 text-center font-semibold tabular-nums">{row.leaguePoints}</td>
    </tr>
  );
}
