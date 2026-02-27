import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";

export default async function TeamsPage() {
  const t = await getTranslations("public");
  const teams = await fetchAPI<Array<Record<string, unknown>>>(
    "/public/teams",
  ).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 pt-[calc(1.5rem+var(--safe-area-top))] pb-[calc(1.5rem+var(--safe-area-bottom))]">
      <h1 className="text-2xl font-bold mb-6">{t("teams")}</h1>
      {teams.length === 0 ? (
        <p className="text-muted-foreground">{t("noTeams")}</p>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <div key={String(team.id)} className="rounded-lg border p-4">
              <p className="font-medium">
                {String(team.teamName ?? team.name ?? "")}
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
