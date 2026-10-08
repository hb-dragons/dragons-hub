"use client";

// PROTOTYPE — Variant B "Triage".
// Work-queue layout: a narrow list grouped by week fills the viewport height
// and the first game is selected automatically, so the big pane is never empty.
// The detail puts SR1 and SR2 side by side with their candidates inline (no
// popover), and once a game is fully staffed it moves on to the next one.
// ↑/↓ (or j/k) move through the list.

import { useEffect } from "react";
import { ArrowRight, Check } from "lucide-react";
import { daysUntilKickoff, plusDaysInClubZone, todayInClubZone } from "@dragons/shared";
import { Button } from "@dragons/ui/components/button";
import { cn } from "@dragons/ui/lib/utils";
import { CandidatePicker } from "../candidate-picker";
import { useRefereeHubUrl } from "../../use-referee-hub-url";
import {
  FilterToolbar,
  type Game,
  SlotMark,
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

/** Monday of the club-zone week a date falls in. */
function weekStart(date: string) {
  const dow = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  return new Date(Date.parse(date + "T12:00:00Z") - dow * 86_400_000).toISOString().slice(0, 10);
}

function weekLabel(monday: string) {
  const thisWeek = weekStart(todayInClubZone());
  const weeks = Math.round((Date.parse(monday) - Date.parse(thisWeek)) / (7 * 86_400_000));
  if (weeks <= 0) return "Diese Woche";
  if (weeks === 1) return "Nächste Woche";
  return `In ${weeks} Wochen`;
}

export function VariantTriage() {
  const { state, update } = useRefereeHubUrl();
  const { games, total } = useProtoGames(state.filters);
  const selectedId = state.gameId ?? games[0]?.apiMatchId ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [role=menu], [role=listbox]")) return;
      const i = games.findIndex((g) => g.apiMatchId === selectedId);
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = games[Math.min(games.length - 1, i + 1)];
        if (next) update({ gameId: next.apiMatchId });
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = games[Math.max(0, i - 1)];
        if (prev) update({ gameId: prev.apiMatchId });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [games, selectedId, update]);

  const nextOpen = () => {
    const i = games.findIndex((g) => g.apiMatchId === selectedId);
    return [...games.slice(i + 1), ...games.slice(0, i)].find((g) => openCount(g) > 0) ?? null;
  };

  const thisWeekOpen = games
    .filter((g) => g.kickoffDate <= plusDaysInClubZone(7))
    .reduce((n, g) => n + openCount(g), 0);

  return (
    <div className="space-y-3">
      <FilterToolbar filters={state.filters} onChange={(patch) => update({ filters: patch })} total={total} />

      <div className="grid h-[calc(100svh-15rem)] min-h-[520px] grid-cols-1 gap-3 md:grid-cols-[minmax(300px,380px)_1fr]">
        <div className="bg-surface-low flex min-h-0 flex-col rounded-md">
          <div className="text-heat px-3 pt-3 pb-1 text-xs font-medium">
            {thisWeekOpen} offene Slots in den nächsten 7 Tagen
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            {groupBy(games, (g) => weekStart(g.kickoffDate)).map(([monday, weekGames]) => (
              <section key={monday}>
                <h3 className="bg-surface-low sticky top-0 z-10 px-3 pt-3 pb-1 font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {weekLabel(monday)}
                </h3>
                {weekGames.map((g) => (
                  <TriageRow
                    key={g.apiMatchId}
                    game={g}
                    selected={g.apiMatchId === selectedId}
                    onSelect={() => update({ gameId: g.apiMatchId })}
                  />
                ))}
              </section>
            ))}
          </div>
        </div>

        <div className="bg-card min-h-0 overflow-y-auto rounded-md">
          {selectedId === null ? (
            <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
              Keine Spiele für diese Filter.
            </div>
          ) : (
            <TriageDetail
              gameId={selectedId}
              onNext={() => {
                const n = nextOpen();
                if (n) update({ gameId: n.apiMatchId });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TriageRow({ game: g, selected, onSelect }: { game: Game; selected: boolean; onSelect: () => void }) {
  const side = ownSide(g);
  const days = daysUntilKickoff(g.kickoffDate);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "hover:bg-surface-high flex w-full items-center gap-3 border-l-2 border-l-transparent px-3 py-2 text-left",
        selected && "bg-primary/10 border-l-primary hover:bg-primary/10",
      )}
    >
      <span
        className={cn(
          "w-9 shrink-0 text-center font-display text-lg font-bold leading-none tabular-nums",
          days <= 7 ? "text-heat" : "text-muted-foreground",
        )}
        title={relativeDay(g.kickoffDate)}
      >
        {days}
        <span className="block text-[10px] font-medium uppercase">Tage</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {side.own} <span className="text-muted-foreground font-normal">{side.where === "Heim" ? "vs" : "@"}</span>{" "}
          {side.opponent}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {g.kickoffTime.slice(0, 5)} · {g.leagueShort}
        </span>
      </span>
      <span className="flex gap-1">
        {ourSlots(g).map((s) => (
          <SlotMark key={s.n} status={s.status} label={`SR${s.n} ${s.status}`} />
        ))}
      </span>
    </button>
  );
}

function TriageDetail({ gameId, onNext }: { gameId: number; onNext: () => void }) {
  const g = useProtoGame(gameId);
  const dayLabel = useDayLabel();
  if (!g) return <div className="text-muted-foreground p-6 text-sm">Lädt…</div>;
  const side = ownSide(g);
  const done = openCount(g) === 0;

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className={cn("text-xs", isUrgent(g.kickoffDate) ? "text-heat" : "text-muted-foreground")}>
            {dayLabel(g.kickoffDate)} · {g.kickoffTime.slice(0, 5)} · {relativeDay(g.kickoffDate)}
          </div>
          <h2 className="font-display text-2xl font-bold">
            {side.own} <span className="text-muted-foreground">{side.where === "Heim" ? "vs" : "@"}</span> {side.opponent}
          </h2>
          <div className="text-muted-foreground text-sm">
            {side.where} · {g.leagueName} · {g.venueName}, {g.venueCity} · #{g.matchNo}
          </div>
        </div>
        <Button variant={done ? "default" : "outline"} size="sm" onClick={onNext}>
          {done && <Check className="size-4" />}
          Nächstes offenes Spiel <ArrowRight className="size-4" />
        </Button>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {ourSlots(g).map((s) => (
          <SlotColumn key={s.n} game={g} slot={s} />
        ))}
      </div>
    </div>
  );
}

function SlotColumn({ game, slot }: { game: Game; slot: ReturnType<typeof ourSlots>[number] }) {
  const actions = useSlotActions(game);
  return (
    <section className="bg-surface-low space-y-3 rounded-md p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide">SR{slot.n}</h3>
        <span
          className={cn(
            "rounded-4xl px-2 py-0.5 text-xs font-medium",
            slot.status === "assigned" && "bg-primary/15 text-primary",
            slot.status === "offered" && "bg-muted text-muted-foreground",
            slot.status === "open" && "bg-heat/15 text-heat",
          )}
        >
          {slot.status === "assigned" ? "besetzt" : slot.status === "offered" ? "angeboten" : "offen"}
        </span>
      </div>
      {slot.status === "assigned" ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-semibold">{slot.name}</span>
          <Button variant="outline" size="sm" disabled={actions.busy} onClick={() => void actions.unassign(slot.n)}>
            Entfernen
          </Button>
        </div>
      ) : (
        <CandidatePicker
          gameApiId={game.apiMatchId}
          slotNumber={slot.n}
          disabled={actions.busy}
          onPick={(id) => void actions.assign(slot.n, id)}
        />
      )}
    </section>
  );
}
