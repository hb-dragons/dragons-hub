import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { WatchRulesList } from "@/components/admin/notifications/watch-rules-list";
import type {
  WatchRuleListResult,
  ChannelConfigListResult,
} from "@/components/admin/notifications/types";

export default async function WatchRulesPage() {
  const t = await getTranslations();
  let rulesData: WatchRuleListResult | null = null;
  let channelsData: ChannelConfigListResult | null = null;
  let error: string | null = null;

  try {
    [rulesData, channelsData] = await Promise.all([
      fetchAPIServer<WatchRuleListResult>("/admin/watch-rules"),
      fetchAPIServer<ChannelConfigListResult>("/admin/channel-configs"),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("watchRules.title")} subtitle={t("watchRules.description")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig
          value={{
            fallback: {
              [SWR_KEYS.watchRules]: rulesData,
              [SWR_KEYS.channelConfigs]: channelsData,
            },
          }}
        >
          <WatchRulesList />
        </SWRConfig>
      )}
    </div>
  );
}
