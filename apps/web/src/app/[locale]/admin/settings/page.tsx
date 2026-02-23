import { fetchAPIServer } from "@/lib/api.server";
import { SettingsProvider } from "@/components/admin/settings/settings-provider";
import { ClubConfig } from "@/components/admin/settings/club-config";
import { TrackedLeagues } from "@/components/admin/settings/tracked-leagues";
import type {
  ClubConfig as ClubConfigType,
  TrackedLeague,
} from "@/components/admin/settings/settings-provider";

interface TrackedLeaguesResponse {
  leagueNumbers: number[];
  leagues: Array<TrackedLeague & { apiLigaId: number }>;
}

export default async function SettingsPage() {
  let clubConfig: ClubConfigType | null = null;
  let trackedLeagues: TrackedLeague[] = [];

  try {
    const [clubResult, leaguesResult] = await Promise.all([
      fetchAPIServer<ClubConfigType | null>("/admin/settings/club"),
      fetchAPIServer<TrackedLeaguesResponse>("/admin/settings/leagues"),
    ]);
    clubConfig = clubResult;
    trackedLeagues = leaguesResult.leagues.map((l) => ({
      id: l.id,
      ligaNr: l.ligaNr,
      name: l.name,
      seasonName: l.seasonName,
    }));
  } catch {
    // Will show empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your club and manage league tracking
        </p>
      </div>

      <SettingsProvider initialClubConfig={clubConfig} initialTrackedLeagues={trackedLeagues}>
        <ClubConfig />
        <TrackedLeagues />
      </SettingsProvider>
    </div>
  );
}
