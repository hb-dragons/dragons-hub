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
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
      <h1 className="px-1 text-xl font-bold md:px-2 md:text-2xl">{t("title")}</h1>
      <SpielplanTable matches={matches} />
    </div>
  );
}
