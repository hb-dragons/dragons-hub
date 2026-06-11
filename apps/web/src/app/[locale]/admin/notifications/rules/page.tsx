import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { getServerApi } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { WatchRulesList } from "@/components/admin/notifications/watch-rules-list";
import type {
  WatchRuleListResult,
  ChannelConfigListResult,
} from "@/components/admin/notifications/types";

export default async function WatchRulesPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

  const t = await getTranslations();
  let rulesData: WatchRuleListResult | null = null;
  let channelsData: ChannelConfigListResult | null = null;
  let error: string | null = null;

  const serverApi = await getServerApi();
  const sq = makeQueries(serverApi);
  const watchRulesQ = sq.watchRules();
  const channelConfigsQ = sq.channelConfigs();

  try {
    [rulesData, channelsData] = await Promise.all([
      watchRulesQ.fetcher(),
      channelConfigsQ.fetcher(),
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
              [watchRulesQ.key]: rulesData,
              [channelConfigsQ.key]: channelsData,
            },
          }}
        >
          <WatchRulesList />
        </SWRConfig>
      )}
    </div>
  );
}
