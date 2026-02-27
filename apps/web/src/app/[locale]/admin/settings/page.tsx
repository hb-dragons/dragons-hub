import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { ClubConfig } from "@/components/admin/settings/club-config";
import { TrackedLeagues } from "@/components/admin/settings/tracked-leagues";
import { BookingConfig } from "@/components/admin/settings/booking-config";
import { ThemeSettings } from "@/components/admin/settings/theme-settings";
import type {
  ClubConfig as ClubConfigType,
  TrackedLeaguesResponse,
} from "@/components/admin/settings/settings-provider";

export default async function SettingsPage() {
  const t = await getTranslations();
  let clubConfig: ClubConfigType | null = null;
  let leaguesResponse: TrackedLeaguesResponse | null = null;
  let bookingConfig: { bufferBefore: number; bufferAfter: number; gameDuration: number; dueDaysBefore: number } | null = null;

  try {
    [clubConfig, leaguesResponse] = await Promise.all([
      fetchAPIServer<ClubConfigType | null>("/admin/settings/club"),
      fetchAPIServer<TrackedLeaguesResponse>("/admin/settings/leagues"),
    ]);
  } catch {
    // Will show empty state for club and leagues
  }

  try {
    bookingConfig = await fetchAPIServer<{ bufferBefore: number; bufferAfter: number; gameDuration: number; dueDaysBefore: number }>("/admin/settings/booking");
  } catch {
    // Will show defaults for booking config
  }

  return (
    <SWRConfig
      value={{
        fallback: {
          [SWR_KEYS.settingsClub]: clubConfig,
          [SWR_KEYS.settingsLeagues]: leaguesResponse,
          [SWR_KEYS.settingsBooking]: bookingConfig,
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

        <ThemeSettings />
        <ClubConfig />
        <TrackedLeagues />
        <BookingConfig />
      </div>
    </SWRConfig>
  );
}
