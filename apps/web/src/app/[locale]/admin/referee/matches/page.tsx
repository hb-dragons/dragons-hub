import { RefereeMatchList } from "@/components/referee/referee-match-list";
import { getTranslations } from "next-intl/server";

export default async function RefereeMatchesPage() {
  const t = await getTranslations("refereeMatches");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <RefereeMatchList />
    </div>
  );
}
