"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { OpenGamesList } from "./open-games-list";
import { OpenSlotDetail } from "./open-slot-detail";

export function OpenSlotsTab() {
  const t = useTranslations("refereeHub.openSlots");
  const { state, update } = useRefereeHubUrl();

  return (
    <div className="grid grid-cols-[minmax(260px,1fr)_2fr] border rounded-md overflow-hidden min-h-[600px]">
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
