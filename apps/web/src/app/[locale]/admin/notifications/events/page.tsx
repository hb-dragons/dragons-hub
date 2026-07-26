import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { getServerApi } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { EventBrowser } from "@/components/admin/notifications/event-browser";
import type { DomainEventListResult } from "@/components/admin/notifications/types";
import { PageError } from "@/components/admin/shared/page-error";

/**
 * The query `EventBrowser` issues on first paint. Both the query object and the
 * serialized params matter, because the params string *is* the cache key:
 * priming `?limit=50` while the browser asks for `?page=1&limit=50` threw the
 * whole server round trip away and still showed "Loading…".
 */
const INITIAL_EVENTS_QUERY = { page: 1, limit: 50 } as const;
const INITIAL_EVENTS_PARAMS = "page=1&limit=50";

export default async function EventsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

  const t = await getTranslations("domainEvents");
  let data: DomainEventListResult | null = null;
  let error: string | null = null;

  const eventsQ = makeQueries(await getServerApi()).domainEvents(
    INITIAL_EVENTS_QUERY,
    INITIAL_EVENTS_PARAMS,
  );

  try {
    data = await eventsQ.fetcher();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("description")} />

      {error ? (
        <PageError message={error} />
      ) : (
        <SWRConfig value={{ fallback: { [eventsQ.key]: data } }}>
          <EventBrowser />
        </SWRConfig>
      )}
    </div>
  );
}
