import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { TeamsTable } from "./teams-table";

interface OwnClubTeam {
  id: number;
  name: string;
  customName: string | null;
  leagueName: string | null;
}

export default async function TeamsPage() {
  const t = await getTranslations();
  let teams: OwnClubTeam[] | null = null;
  let error: string | null = null;

  try {
    teams = await fetchAPIServer<OwnClubTeam[]>("/admin/teams");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("teams.title")}</h1>
        <p className="text-muted-foreground">
          {t("teams.description")}
        </p>
      </div>

      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.teams]: teams } }}>
          <TeamsTable />
        </SWRConfig>
      )}
    </div>
  );
}
