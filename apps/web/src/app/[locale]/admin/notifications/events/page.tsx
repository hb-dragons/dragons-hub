import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { EventBrowser } from "@/components/admin/notifications/event-browser";
import type { DomainEventListResult } from "@/components/admin/notifications/types";

export default async function EventsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

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
      <PageHeader title={t("title")} subtitle={t("description")} />

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
