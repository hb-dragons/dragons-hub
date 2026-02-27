import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";

export default async function SchedulePage() {
  const t = await getTranslations("public");
  const matches = await fetchAPI<{ data: Array<Record<string, unknown>> }>(
    "/public/matches?limit=50",
  ).catch(() => ({ data: [] }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 pt-[calc(1.5rem+var(--safe-area-top))] pb-[calc(1.5rem+var(--safe-area-bottom))]">
      <h1 className="text-2xl font-bold mb-6">{t("schedule")}</h1>
      {matches.data.length === 0 ? (
        <p className="text-muted-foreground">{t("noMatches")}</p>
      ) : (
        <div className="space-y-3">
          {matches.data.map((match) => (
            <div key={String(match.id)} className="rounded-lg border p-4">
              <p className="font-medium">
                {String(match.homeTeamName ?? "")} vs{" "}
                {String(match.awayTeamName ?? "")}
              </p>
              <p className="text-sm text-muted-foreground">
                {match.matchDate
                  ? new Date(String(match.matchDate)).toLocaleDateString()
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8">
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("adminLink")} →
        </Link>
      </div>
    </div>
  );
}
