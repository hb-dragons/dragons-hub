import { getTranslations } from "next-intl/server";
import type { MatchListItem } from "@dragons/shared";
import { getPublicServerApi } from "@/lib/api.server";
import { fetchFullPlan } from "@/components/public/spielplan/fetch-plan";
import { SpielplanTable } from "@/components/public/spielplan/spielplan-table";

export default async function SpielplanPage() {
  const t = await getTranslations("spielplan");

  const api = getPublicServerApi();
  const matches: MatchListItem[] = await fetchFullPlan((params) =>
    api.getMatches(params),
  ).catch(() => []);

  return (
    <div className="space-y-4">
      <h1 className="px-6 text-2xl font-bold">{t("title")}</h1>
      <SpielplanTable matches={matches} />
    </div>
  );
}
