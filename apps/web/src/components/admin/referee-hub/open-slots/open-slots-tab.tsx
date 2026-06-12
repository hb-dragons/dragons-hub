"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { queries } from "@/lib/swr-queries";
import { SlotsFilterSidebar } from "./slots-filter-sidebar";
import { OpenGamesList } from "./open-games-list";
import { OpenSlotDetail } from "./open-slot-detail";

export function OpenSlotsTab() {
  const t = useTranslations("refereeHub.openSlots");
  const { state, update } = useRefereeHubUrl();

  const settingsLeaguesQ = queries.settingsLeagues();
  const { data: leagueData } = useSWR(settingsLeaguesQ.key, settingsLeaguesQ.fetcher);
  const leagueOptions = (leagueData?.leagues ?? []).map((l) => ({
    value: String(l.apiLigaId),
    label: l.name,
  }));

  return (
    <div className="grid grid-cols-[200px_320px_1fr] gap-px bg-border/15 rounded-md overflow-hidden min-h-[600px]">
      <SlotsFilterSidebar
        filters={state.filters}
        onChange={(patch) => update({ filters: { ...state.filters, ...patch } })}
        leagueOptions={leagueOptions}
      />
      <div className="bg-surface-low">
        <OpenGamesList
          filters={state.filters}
          selectedGameId={state.gameId}
          onSelect={(gameId) => update({ gameId })}
        />
      </div>
      <div className="bg-card">
        {state.gameId !== null ? (
          <OpenSlotDetail selectedGameId={state.gameId} />
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t("detail.selectGamePrompt")}
          </div>
        )}
      </div>
    </div>
  );
}
