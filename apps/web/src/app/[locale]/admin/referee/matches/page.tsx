import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { RefereeMatchList } from "@/components/referee/referee-match-list";
import type { RefereeMatchListItem, PaginatedResponse } from "@dragons/shared";

export default async function RefereeMatchesPage() {
  const t = await getTranslations("refereeMatches");
  let data: PaginatedResponse<RefereeMatchListItem> | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<PaginatedResponse<RefereeMatchListItem>>(
      SWR_KEYS.refereeMatches,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.refereeMatches]: data } }}>
          <RefereeMatchList />
        </SWRConfig>
      )}
    </div>
  );
}
