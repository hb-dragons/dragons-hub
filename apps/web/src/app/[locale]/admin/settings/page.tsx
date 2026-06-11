import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { getServerApi } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { ClubConfig } from "@/components/admin/settings/club-config";
import { TrackedLeagues } from "@/components/admin/settings/tracked-leagues";
import { BookingConfig } from "@/components/admin/settings/booking-config";
import { ThemeSettings } from "@/components/admin/settings/theme-settings";
import type {
  ClubConfig as ClubConfigType,
  TrackedLeaguesResponse,
} from "@/components/admin/settings/settings-provider";

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

  const t = await getTranslations();
  let clubConfig: ClubConfigType | null = null;
  let leaguesResponse: TrackedLeaguesResponse | null = null;
  let bookingConfig: { bufferBefore: number; bufferAfter: number; gameDuration: number; dueDaysBefore: number } | null = null;

  const serverApi = await getServerApi();
  const sq = makeQueries(serverApi);
  const clubQ = sq.settingsClub();
  const leaguesQ = sq.settingsLeagues();
  const bookingQ = sq.settingsBooking();

  try {
    [clubConfig, leaguesResponse] = await Promise.all([
      clubQ.fetcher(),
      leaguesQ.fetcher(),
    ]);
  } catch {
    // Will show empty state for club and leagues
  }

  try {
    bookingConfig = await bookingQ.fetcher();
  } catch {
    // Will show defaults for booking config
  }

  return (
    <SWRConfig
      value={{
        fallback: {
          [clubQ.key]: clubConfig,
          [leaguesQ.key]: leaguesResponse,
          [bookingQ.key]: bookingConfig,
        },
      }}
    >
      <div className="space-y-6">
        <PageHeader title={t("settings.title")} subtitle={t("settings.description")} />

        <ThemeSettings />
        <ClubConfig />
        <TrackedLeagues />
        <BookingConfig />
      </div>
    </SWRConfig>
  );
}
