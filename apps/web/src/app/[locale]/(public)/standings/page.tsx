import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";

export default async function StandingsPage() {
  const t = await getTranslations("public");
  const standings = await fetchAPI<Array<Record<string, unknown>>>(
    "/public/standings",
  ).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 pt-[calc(1.5rem+var(--safe-area-top))] pb-[calc(1.5rem+var(--safe-area-bottom))]">
      <h1 className="text-2xl font-bold mb-6">{t("standings")}</h1>
      {standings.length === 0 ? (
        <p className="text-muted-foreground">{t("noStandings")}</p>
      ) : (
        <pre className="text-sm">{JSON.stringify(standings, null, 2)}</pre>
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
