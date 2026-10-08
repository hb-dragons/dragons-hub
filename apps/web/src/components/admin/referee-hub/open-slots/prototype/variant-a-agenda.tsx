"use client";

// PROTOTYPE — Variant A "Agenda + Sheet".
// Full-width agenda grouped by day with sticky day headers; the filter row sits
// on top. Each game is one dense line. Staffing happens in a side sheet so the
// list never loses its width.

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@dragons/ui/components/sheet";
import { Button } from "@dragons/ui/components/button";
import { cn } from "@dragons/ui/lib/utils";
import { CandidatePicker } from "../candidate-picker";
import { useRefereeHubUrl } from "../../use-referee-hub-url";
import {
  FilterToolbar,
  type Game,
  groupBy,
  isUrgent,
  openCount,
  ourSlots,
  ownSide,
  relativeDay,
  useDayLabel,
  useProtoGame,
  useProtoGames,
  useSlotActions,
} from "./shared";

export function VariantAgenda() {
  const { state, update } = useRefereeHubUrl();
  const { games, total, isLoading } = useProtoGames(state.filters);
  const dayLabel = useDayLabel();

  return (
    <div className="space-y-4">
      <FilterToolbar
        filters={state.filters}
        onChange={(patch) => update({ filters: patch })}
        total={total}
        className="bg-surface-low rounded-md p-3"
      />

      <div className="bg-card overflow-hidden rounded-md">
        {isLoading && games.length === 0 && <div className="text-muted-foreground p-6 text-sm">Lädt…</div>}
        {!isLoading && games.length === 0 && (
          <div className="text-muted-foreground p-10 text-center text-sm">Keine Spiele für diese Filter.</div>
        )}
        {groupBy(games, (g) => g.kickoffDate).map(([date, dayGames]) => (
          <section key={date}>
            <h3
              className={cn(
                "bg-surface-low sticky top-0 z-10 flex items-baseline gap-3 px-4 py-2 font-display text-xs font-medium uppercase tracking-wide",
                isUrgent(date) ? "text-heat" : "text-muted-foreground",
              )}
            >
              {dayLabel(date)}
              <span className="font-sans normal-case tracking-normal opacity-80">{relativeDay(date)}</span>
              <span className="ml-auto font-sans normal-case tracking-normal">
                {dayGames.reduce((n, g) => n + openCount(g), 0)} offene Slots
              </span>
            </h3>
            {dayGames.map((g) => (
              <AgendaRow
                key={g.apiMatchId}
                game={g}
                selected={g.apiMatchId === state.gameId}
                onOpen={() => update({ gameId: g.apiMatchId })}
              />
            ))}
          </section>
        ))}
      </div>

      <Sheet open={state.gameId !== null} onOpenChange={(o) => !o && update({ gameId: null })}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {state.gameId !== null && <GameSheet gameId={state.gameId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AgendaRow({ game: g, selected, onOpen }: { game: Game; selected: boolean; onOpen: () => void }) {
  const side = ownSide(g);
  const slots = ourSlots(g);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "hover:bg-surface-high grid w-full grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors md:grid-cols-[3.5rem_minmax(0,1fr)_7rem_6rem_minmax(0,14rem)_auto]",
        selected && "bg-primary/10",
      )}
    >
      <span className="font-mono text-sm tabular-nums">{g.kickoffTime.slice(0, 5)}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{side.own}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {side.where === "Heim" ? "gegen" : "bei"} {side.opponent}
        </span>
      </span>
      <span className="text-muted-foreground hidden truncate text-xs md:block" title={g.leagueName ?? ""}>
        {g.leagueShort}
      </span>
      <span className="hidden text-xs md:block">{side.where}</span>
      <span className="hidden min-w-0 gap-3 md:flex">
        {slots.map((s) => (
          <span key={s.n} className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">SR{s.n}</span>
            {s.status === "assigned" ? (
              <span className="truncate">{s.name}</span>
            ) : (
              <span className={s.status === "open" ? "text-heat font-medium" : "text-muted-foreground"}>
                {s.status === "open" ? "offen" : "angeboten"}
              </span>
            )}
          </span>
        ))}
      </span>
      <span className="justify-self-end">
        {openCount(g) > 0 ? (
          <span className="bg-heat/15 text-heat rounded-4xl px-2 py-0.5 text-xs font-medium">{openCount(g)} offen</span>
        ) : (
          <span className="bg-primary/15 text-primary rounded-4xl px-2 py-0.5 text-xs font-medium">besetzt</span>
        )}
      </span>
    </button>
  );
}

function GameSheet({ gameId }: { gameId: number }) {
  // Loaded by id, not taken from the list: staffing a game can filter it out.
  const g = useProtoGame(gameId);
  if (!g) return <SheetTitle className="p-4 text-sm">Lädt…</SheetTitle>;
  return <GameSheetBody game={g} />;
}

function GameSheetBody({ game: g }: { game: Game }) {
  const side = ownSide(g);
  const dayLabel = useDayLabel();
  const actions = useSlotActions(g);
  return (
    <>
      <SheetHeader>
        <SheetDescription>
          {dayLabel(g.kickoffDate)} · {g.kickoffTime.slice(0, 5)} · {g.leagueShort} · #{g.matchNo}
        </SheetDescription>
        <SheetTitle className="font-display text-xl">
          {g.homeTeamName} – {g.guestTeamName}
        </SheetTitle>
        <SheetDescription>
          {side.where} · {g.venueName}, {g.venueCity}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-6 px-4 pb-6">
        {ourSlots(g).map((s) => (
          <section key={s.n} className="bg-surface-low space-y-3 rounded-md p-3">
            <div className="flex items-center justify-between">
              <h4 className="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Schiedsrichter {s.n}
              </h4>
              {s.status === "assigned" && (
                <Button variant="outline" size="sm" disabled={actions.busy} onClick={() => void actions.unassign(s.n)}>
                  Entfernen
                </Button>
              )}
            </div>
            {s.status === "assigned" ? (
              <p className="text-sm font-semibold">{s.name}</p>
            ) : (
              <CandidatePicker
                gameApiId={g.apiMatchId}
                slotNumber={s.n}
                disabled={actions.busy}
                onPick={(id) => void actions.assign(s.n, id)}
              />
            )}
          </section>
        ))}
      </div>
    </>
  );
}
