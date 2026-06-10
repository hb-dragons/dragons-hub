"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SlotCard } from "./slot-card";
import type { RefereeGameListItem } from "@dragons/shared";

interface Props {
  selectedGameId: number;
}

export function OpenSlotDetail({ selectedGameId }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const key = `/referee/games/by-api-match/${selectedGameId}`;
  const { data: game, mutate } = useSWR<RefereeGameListItem>(key, apiFetcher);

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
        assignment={{ refereeApiId: game.sr1RefereeApiId, refereeName: game.sr1Name, status: game.sr1Status }}
        onChange={() => { void mutate(); }}
      />
      <SlotCard
        gameApiId={game.apiMatchId}
        slotNumber={2}
        assignment={{ refereeApiId: game.sr2RefereeApiId, refereeName: game.sr2Name, status: game.sr2Status }}
        onChange={() => { void mutate(); }}
      />
    </div>
  );
}
