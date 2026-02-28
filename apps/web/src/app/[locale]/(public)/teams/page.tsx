import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";

interface PublicTeam {
  id: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  isOwnClub: boolean | null;
}

export default async function TeamsPage() {
  const t = await getTranslations("public");
  const teams = await fetchAPI<PublicTeam[]>("/public/teams").catch(() => []);

  const ownTeams = teams.filter((team) => team.isOwnClub);
  const otherTeams = teams.filter((team) => !team.isOwnClub);

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">{t("noTeams")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("teams")}</h1>

      {/* Own club teams */}
      {ownTeams.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {ownTeams.map((team) => (
            <div
              key={team.id}
              className="rounded-xl border-2 border-mint-shade/30 bg-mint-tint/5 p-4"
            >
              <p className="font-semibold text-mint-shade">
                {team.customName ?? team.nameShort ?? team.name}
              </p>
              {team.customName && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {team.name}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Other teams */}
      {otherTeams.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {otherTeams.map((team) => (
            <div
              key={team.id}
              className="rounded-xl border p-3"
            >
              <p className="text-sm font-medium">
                {team.nameShort ?? team.name}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
