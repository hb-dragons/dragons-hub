import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { getServerApi } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { TeamsTable } from "./teams-table";
import type { OwnClubTeam } from "@dragons/shared";

export default async function TeamsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "team", "view")) notFound();
  const canManage = can(session?.user ?? null, "team", "manage");

  const t = await getTranslations();
  let teams: OwnClubTeam[] | null = null;
  let error: string | null = null;

  const sApi = await getServerApi();
  const sq = makeQueries(sApi);
  const teamsQ = sq.teams();

  try {
    teams = await teamsQ.fetcher();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("teams.title")} subtitle={t("teams.description")} />

      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <SWRConfig value={{ fallback: { [teamsQ.key]: teams } }}>
          <TeamsTable canManage={canManage} />
        </SWRConfig>
      )}
    </div>
  );
}
