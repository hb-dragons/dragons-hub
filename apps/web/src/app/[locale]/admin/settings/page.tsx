import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { ClubConfig } from "@/components/admin/settings/club-config";
import { TrackedLeagues } from "@/components/admin/settings/tracked-leagues";
import type {
  ClubConfig as ClubConfigType,
  TrackedLeaguesResponse,
} from "@/components/admin/settings/settings-provider";

export default async function SettingsPage() {
  const t = await getTranslations();
  let clubConfig: ClubConfigType | null = null;
  let leaguesResponse: TrackedLeaguesResponse | null = null;

  try {
    [clubConfig, leaguesResponse] = await Promise.all([
      fetchAPIServer<ClubConfigType | null>("/admin/settings/club"),
      fetchAPIServer<TrackedLeaguesResponse>("/admin/settings/leagues"),
    ]);
  } catch {
    // Will show empty state
  }

  return (
    <SWRConfig
      value={{
        fallback: {
          [SWR_KEYS.settingsClub]: clubConfig,
          [SWR_KEYS.settingsLeagues]: leaguesResponse,
        },
      }}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
          <p className="text-muted-foreground">
            {t("settings.description")}
          </p>
        </div>

        <ClubConfig />
        <TrackedLeagues />
      </div>
    </SWRConfig>
  );
}
