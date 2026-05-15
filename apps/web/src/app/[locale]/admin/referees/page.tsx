import { notFound } from "next/navigation";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWR_KEYS } from "@/lib/swr-keys";
import { RefereeHubPage } from "@/components/admin/referee-hub/referee-hub";

export default async function RefereesPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "referee", "view")) notFound();

  const fallback: Record<string, unknown> = {};

  try {
    const referees = await fetchAPIServer<unknown>("/admin/referees");
    fallback[SWR_KEYS.referees(true)] = referees;
  } catch {}

  try {
    const refereeGames = await fetchAPIServer<unknown>(SWR_KEYS.refereeGames);
    fallback[SWR_KEYS.refereeGames] = refereeGames;
  } catch {}

  return (
    <SWRConfig value={{ fallback }}>
      <RefereeHubPage />
    </SWRConfig>
  );
}
