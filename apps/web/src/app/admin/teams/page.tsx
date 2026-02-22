import { fetchAPIServer } from "@/lib/api.server";
import { TeamsTable } from "./teams-table";

interface OwnClubTeam {
  id: number;
  name: string;
  customName: string | null;
  leagueName: string | null;
}

export default async function TeamsPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
        <p className="text-muted-foreground">
          Assign custom names to your club&apos;s teams
        </p>
      </div>

      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <TeamsTable initialTeams={teams ?? []} />
      )}
    </div>
  );
}
