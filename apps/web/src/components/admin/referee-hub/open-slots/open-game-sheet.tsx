"use client";

import useSWR, { useSWRConfig } from "swr";
import { useTranslations, useFormatter } from "next-intl";
import { clubDayAnchor, type RefereeGameListItem } from "@dragons/shared";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@dragons/ui/components/sheet";
import { queries } from "@/lib/swr-queries";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SlotCard } from "./slot-card";
import { isOpenGamesListKey } from "./open-games-query";
import { ownSide } from "./open-game-facts";

interface Props {
  /** The game to staff, by federation match id; null keeps the sheet closed. */
  gameId: number | null;
  onClose: () => void;
}

/**
 * Staffing for one game, in a sheet over the agenda so the list keeps its full
 * width. The game is loaded by id rather than taken from the list: staffing it
 * can filter it out of the list, and the sheet must stay put when that happens.
 */
export function OpenGameSheet({ gameId, onClose }: Props) {
  return (
    <Sheet open={gameId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {gameId !== null && <SheetBody gameId={gameId} />}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ gameId }: { gameId: number }) {
  const t = useTranslations("refereeHub.openSlots");
  const { mutate: globalMutate } = useSWRConfig();
  const gameQ = queries.refereeGameByApiMatch(gameId);
  const { data: game, error, isLoading, mutate } = useSWR(gameQ.key, gameQ.fetcher);

  // Assigning a referee changes the agenda's rows too, so revalidate every
  // open-games page, not just this game.
  const handleSlotChange = () => {
    void mutate();
    void globalMutate(isOpenGamesListKey);
  };

  if (error) {
    return (
      <>
        <SheetTitle className="sr-only">{t("loadError")}</SheetTitle>
        <ErrorState className="m-4" onRetry={() => { void mutate(); }} />
      </>
    );
  }
  if (isLoading && !game) {
    return (
      <>
        <SheetTitle className="sr-only">{t("loading")}</SheetTitle>
        <LoadingState className="p-6" rows={3} />
      </>
    );
  }
  if (!game) {
    return (
      <SheetTitle className="p-6 text-center text-sm font-normal text-muted-foreground">
        {t("detail.notFound")}
      </SheetTitle>
    );
  }

  return (
    <>
      <GameHeader game={game} />
      <div className="space-y-4 px-4 pb-6">
        {([1, 2] as const).map((n) => {
          const ours = n === 1 ? game.sr1OurClub : game.sr2OurClub;
          const status = n === 1 ? game.sr1Status : game.sr2Status;
          const name = n === 1 ? game.sr1Name : game.sr2Name;
          if (!ours) {
            return (
              <section key={n} className="bg-surface-low rounded-md p-3">
                <h3 className="font-display text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t("slot.label", { n: String(n) })}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("detail.otherClub")}
                  {name && ` · ${name}`}
                </p>
              </section>
            );
          }
          return (
            <SlotCard
              key={n}
              gameApiId={game.apiMatchId}
              slotNumber={n}
              assignment={{
                refereeApiId: n === 1 ? game.sr1RefereeApiId : game.sr2RefereeApiId,
                refereeName: name,
                status,
              }}
              onChange={handleSlotChange}
            />
          );
        })}
      </div>
    </>
  );
}

function GameHeader({ game }: { game: RefereeGameListItem }) {
  const t = useTranslations("refereeHub.openSlots");
  const format = useFormatter();
  const day = format.dateTime(clubDayAnchor(game.kickoffDate), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const side = ownSide(game);
  return (
    <SheetHeader>
      <SheetDescription>
        {day} · {game.kickoffTime.slice(0, 5)}
        {game.leagueShort && ` · ${game.leagueShort}`} · #{game.matchNo}
      </SheetDescription>
      <SheetTitle className="font-display text-xl font-bold">
        {t("matchup", { home: game.homeTeamName, guest: game.guestTeamName })}
      </SheetTitle>
      <SheetDescription>
        {t(side.home ? "agenda.home" : "agenda.away")}
        {game.venueName && ` · ${game.venueName}`}
        {game.venueCity && `, ${game.venueCity}`}
      </SheetDescription>
    </SheetHeader>
  );
}
