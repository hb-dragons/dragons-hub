"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { SWR_KEYS } from "@/lib/swr-keys";
import { apiFetcher } from "@/lib/swr";
import { SlotsFilterSidebar } from "./slots-filter-sidebar";
import { OpenGamesList } from "./open-games-list";
import { OpenSlotDetail } from "./open-slot-detail";
import type { TrackedLeaguesResponse } from "@dragons/shared";

export function OpenSlotsTab() {
  const t = useTranslations("refereeHub.openSlots");
  const { state, update } = useRefereeHubUrl();

  const { data: leagueData } = useSWR<TrackedLeaguesResponse>(
    SWR_KEYS.settingsLeagues,
    apiFetcher,
  );
  const leagueOptions = (leagueData?.leagues ?? []).map((l) => ({
    value: String(l.apiLigaId),
    label: l.name,
  }));

  return (
    <div className="grid grid-cols-[200px_320px_1fr] border rounded-md overflow-hidden min-h-[600px]">
      <SlotsFilterSidebar
        filters={state.filters}
        onChange={(patch) => update({ filters: { ...state.filters, ...patch } })}
        leagueOptions={leagueOptions}
      />
      <div className="border-r">
        <OpenGamesList
          filters={state.filters}
          selectedGameId={state.gameId}
          onSelect={(gameId) => update({ gameId })}
        />
      </div>
      <div>
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
