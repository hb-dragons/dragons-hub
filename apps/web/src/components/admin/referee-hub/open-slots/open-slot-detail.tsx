"use client";

import useSWR, { useSWRConfig } from "swr";
import { useTranslations, useFormatter } from "next-intl";
import { formatKickoff } from "@/lib/format-kickoff";
import { queries } from "@/lib/swr-queries";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SlotCard } from "./slot-card";
import { isOpenGamesListKey } from "./open-games-query";

interface Props {
  selectedGameId: number;
}

export function OpenSlotDetail({ selectedGameId }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const format = useFormatter();
  const { mutate: globalMutate } = useSWRConfig();
  const gameQ = queries.refereeGameByApiMatch(selectedGameId);
  const { data: game, error, isLoading, mutate } = useSWR(gameQ.key, gameQ.fetcher);

  // Assigning a referee changes the slot badges in the left-hand list too, so
  // revalidate every open-games page, not just this detail record.
  const handleSlotChange = () => {
    void mutate();
    void globalMutate(isOpenGamesListKey);
  };

  if (error) {
    return <ErrorState className="m-4" onRetry={() => { void mutate(); }} />;
  }

  // Previously every click flashed "Game not found" while the request was in
  // flight. Only report "not found" once the API has actually answered.
  if (isLoading && !game) {
    return <LoadingState className="p-6" rows={3} />;
  }

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
          {formatKickoff(format, game.kickoffDate, game.kickoffTime)} · {game.leagueShort ?? ""} · #{game.matchNo}
        </div>
        <h2 className="font-display text-xl font-bold">
          {t("matchup", { home: game.homeTeamName, guest: game.guestTeamName })}
        </h2>
        {game.venueName && (
          <div className="text-sm text-muted-foreground">
            {game.venueName}
            {game.venueCity && `, ${game.venueCity}`}
          </div>
        )}
      </div>
      <SlotCard
        gameApiId={game.apiMatchId}
        slotNumber={1}
        assignment={{ refereeApiId: game.sr1RefereeApiId, refereeName: game.sr1Name, status: game.sr1Status }}
        onChange={handleSlotChange}
      />
      <SlotCard
        gameApiId={game.apiMatchId}
        slotNumber={2}
        assignment={{ refereeApiId: game.sr2RefereeApiId, refereeName: game.sr2Name, status: game.sr2Status }}
        onChange={handleSlotChange}
      />
    </div>
  );
}
