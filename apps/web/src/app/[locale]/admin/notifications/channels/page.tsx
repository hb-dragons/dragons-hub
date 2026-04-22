import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { ChannelConfigsList } from "@/components/admin/notifications/channel-configs-list";
import type { ChannelConfigListResult } from "@/components/admin/notifications/types";

export default async function ChannelConfigsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

  const t = await getTranslations();
  let data: ChannelConfigListResult | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<ChannelConfigListResult>(
      "/admin/channel-configs",
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("channelConfigs.title")} subtitle={t("channelConfigs.description")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig
          value={{ fallback: { [SWR_KEYS.channelConfigs]: data } }}
        >
          <ChannelConfigsList />
        </SWRConfig>
      )}
    </div>
  );
}
