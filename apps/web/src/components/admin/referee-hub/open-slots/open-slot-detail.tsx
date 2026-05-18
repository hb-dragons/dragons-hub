"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { SlotCard } from "./slot-card";
import type { RefereeGameListItem } from "@dragons/shared";

interface Props {
  selectedGameId: number;
}

interface ApiResponse { items: RefereeGameListItem[] }

export function OpenSlotDetail({ selectedGameId }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const { data, mutate } = useSWR<ApiResponse>(SWR_KEYS.refereeGames, apiFetcher);
  const game = data?.items.find((g) => g.apiMatchId === selectedGameId);

  if (!game) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {t("detail.notFound")}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xs text-muted-foreground">
          {game.kickoffDate} · {game.kickoffTime} · {game.leagueShort ?? ""} · #{game.matchNo}
        </div>
        <h2 className="text-xl font-semibold">{game.homeTeamName} vs {game.guestTeamName}</h2>
      </div>
      <SlotCard
        gameApiId={game.apiMatchId}
        slotNumber={1}
        assignment={{
          refereeApiId: game.sr1RefereeApiId,
          refereeName: game.sr1Name,
          status: game.sr1Status,
        }}
        onChange={() => mutate()}
      />
      <SlotCard
        gameApiId={game.apiMatchId}
        slotNumber={2}
        assignment={{
          refereeApiId: game.sr2RefereeApiId,
          refereeName: game.sr2Name,
          status: game.sr2Status,
        }}
        onChange={() => mutate()}
      />
    </div>
  );
}
