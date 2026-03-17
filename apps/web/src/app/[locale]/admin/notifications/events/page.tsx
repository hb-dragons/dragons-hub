import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { EventBrowser } from "@/components/admin/notifications/event-browser";
import type { DomainEventListResult } from "@/components/admin/notifications/types";

export default async function EventsPage() {
  const t = await getTranslations("domainEvents");
  let data: DomainEventListResult | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<DomainEventListResult>(
      "/admin/events?limit=50",
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  const swrKey = SWR_KEYS.domainEvents("limit=50");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [swrKey]: data } }}>
          <EventBrowser />
        </SWRConfig>
      )}
    </div>
  );
}
