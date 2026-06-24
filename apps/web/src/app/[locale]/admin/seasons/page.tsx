import { getServerSession } from "@/lib/auth-server";
import { can } from "@dragons/shared";
import { notFound } from "next/navigation";
import { getServerApi } from "@/lib/api.server";
import { makeQueries } from "@/lib/swr-queries";
import { SWRConfig } from "swr";
import { SeasonsList } from "@/components/admin/seasons/seasons-list";
import type { SeasonWithCounts } from "@dragons/shared";

export default async function SeasonsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

  const serverApi = await getServerApi();
  const q = makeQueries(serverApi).seasons();
  let seasons: SeasonWithCounts[] = [];
  try {
    seasons = await q.fetcher();
  } catch {
    // empty state
  }

  return (
    <SWRConfig value={{ fallback: { [q.key]: seasons } }}>
      <SeasonsList />
    </SWRConfig>
  );
}
