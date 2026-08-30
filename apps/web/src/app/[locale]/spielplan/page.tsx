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
    <div className="flex min-h-0 flex-1 flex-col gap-2 md:gap-4">
      {/* On phones the sticky brand header is identity enough — the title
          would be a third stacked banner above the table. */}
      <h1 className="hidden px-2 text-2xl font-bold md:block">{t("title")}</h1>
      <SpielplanTable matches={matches} />
    </div>
  );
}
