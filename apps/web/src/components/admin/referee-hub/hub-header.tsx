"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl, type HubTab, type HubRange } from "./use-referee-hub-url";
import { Tabs, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";

const TABS = ["open-slots", "referees"] as const satisfies HubTab[];
const RANGES = ["season", "30d", "month", "custom"] as const satisfies HubRange[];

export function HubHeader() {
  const t = useTranslations("refereeHub");
  const { state, update } = useRefereeHubUrl();

  return (
    <div className="flex flex-col gap-3 border-b pb-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <div className="flex items-center gap-3">
        <Tabs value={state.tab} onValueChange={(v) => update({ tab: v as HubTab })}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(`tabs.${tab === "open-slots" ? "openSlots" : "referees"}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={state.range} onValueChange={(v) => update({ range: v as HubRange })}>
          <SelectTrigger className="w-[160px]" aria-label={t("range.label")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`range.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
