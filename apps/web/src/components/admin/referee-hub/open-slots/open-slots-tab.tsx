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

  // Stacks below lg: the three-pane layout needs ~800px and was unusable on a
  // phone, which is where this hub gets opened on a match day.
  return (
    <div className="bg-border/15 grid min-h-[600px] grid-cols-1 gap-px overflow-hidden rounded-md lg:grid-cols-[220px_340px_1fr]">
      <SlotsFilterSidebar
        filters={state.filters}
        onChange={(patch) => update({ filters: patch })}
        leagueOptions={leagueOptions}
      />
      <div className="bg-surface-low">
        <OpenGamesList
          filters={state.filters}
          selectedGameId={state.gameId}
          onSelect={(gameId) => update({ gameId })}
          onSearch={(search) => update({ filters: { search } })}
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
