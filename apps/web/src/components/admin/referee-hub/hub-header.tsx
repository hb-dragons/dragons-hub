"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl, type HubTab } from "./use-referee-hub-url";
import { PageHeader } from "@/components/admin/shared/page-header";
import { Tabs, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";

const TABS = ["open-slots", "referees"] as const satisfies HubTab[];

export function HubHeader() {
  const t = useTranslations("refereeHub");
  const { state, update } = useRefereeHubUrl();

  return (
    <PageHeader title={t("title")} subtitle={t("subtitle")}>
      <Tabs value={state.tab} onValueChange={(v) => update({ tab: v as HubTab })}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`tabs.${tab === "open-slots" ? "openSlots" : "referees"}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </PageHeader>
  );
}
