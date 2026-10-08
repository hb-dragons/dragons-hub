"use client";

// PROTOTYPE — Variant C "Weekend board".
// No list, no detail pane: one column per week (basketball happens on
// weekends), a card per game, and every slot chip on a card is its own action:
// an open chip opens the candidate picker right there, an assigned chip can be
// cleared. Totals per weekend sit on top. Filters are chips, not a form.

import { useState } from "react";
import { X } from "lucide-react";
import { useFormatter } from "next-intl";
import { clubDayAnchor, todayInClubZone } from "@dragons/shared";
import { Popover, PopoverContent, PopoverTrigger } from "@dragons/ui/components/popover";
import { Tabs, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";
import { cn } from "@dragons/ui/lib/utils";
import { CandidatePicker } from "../candidate-picker";
import { useRefereeHubUrl, type HubFilters } from "../../use-referee-hub-url";
import {
  type Game,
  groupBy,
  openCount,
  ourSlots,
  ownSide,
  relativeDay,
  useProtoGames,
  useProtoLeagues,
  useSlotActions,
} from "./shared";

function weekStart(date: string) {
  const dow = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  return new Date(Date.parse(date + "T12:00:00Z") - dow * 86_400_000).toISOString().slice(0, 10);
}
const plus = (iso: string, n: number) =>
  new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export function VariantBoard() {
  const { state, update } = useRefereeHubUrl();
  const { games } = useProtoGames(state.filters);
  const format = useFormatter();
  const weeks = groupBy(games, (g) => weekStart(g.kickoffDate));
  const short = (d: string) => format.dateTime(clubDayAnchor(d), { day: "numeric", month: "short" });

  return (
    <div className="space-y-4">
      <BoardFilters filters={state.filters} onChange={(patch) => update({ filters: patch })} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {weeks.slice(0, 3).map(([monday, wg], i) => (
          <Stat
            key={monday}
            label={i === 0 && monday <= todayInClubZone() ? "Dieses Wochenende" : `WE ${short(plus(monday, 5))}`}
            value={wg.reduce((n, g) => n + openCount(g), 0)}
            hot={i === 0}
          />
        ))}
        <Stat label="Offen gesamt" value={games.reduce((n, g) => n + openCount(g), 0)} />
      </div>

      {/* w-0 + min-w-full: the board scrolls inside the page instead of
          widening the whole admin shell (its flex ancestors size to content). */}
      <div className="flex w-0 min-w-full snap-x gap-3 overflow-x-auto pb-16">
        {weeks.map(([monday, weekGames]) => (
          <section key={monday} className="bg-surface-low w-80 shrink-0 snap-start rounded-md">
            <header className="flex items-baseline justify-between px-3 pt-3 pb-2">
              <h3 className="font-display text-sm font-bold uppercase tracking-tight">
                {short(plus(monday, 5))} – {short(plus(monday, 6))}
              </h3>
              <span className="text-heat text-xs font-medium">
                {weekGames.reduce((n, g) => n + openCount(g), 0)} offen
              </span>
            </header>
            <div className="space-y-2 px-2 pb-2">
              {weekGames.map((g) => (
                <GameCard key={g.apiMatchId} game={g} />
              ))}
            </div>
          </section>
        ))}
        {weeks.length === 0 && <div className="text-muted-foreground p-6 text-sm">Keine Spiele für diese Filter.</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: number; hot?: boolean }) {
  return (
    <div className="bg-card rounded-md p-3">
      <div className="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("font-display text-3xl font-bold", hot && value > 0 && "text-heat")}>{value}</div>
      <div className="text-muted-foreground text-xs">offene Slots</div>
    </div>
  );
}

function BoardFilters({ filters, onChange }: { filters: HubFilters; onChange: (p: Partial<HubFilters>) => void }) {
  const leagues = useProtoLeagues();
  const toggle = (id: string) =>
    onChange({ league: filters.league.includes(id) ? filters.league.filter((x) => x !== id) : [...filters.league, id] });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={filters.status} onValueChange={(v) => onChange({ status: v as HubFilters["status"] })}>
        <TabsList>
          <TabsTrigger value="open">Offen</TabsTrigger>
          <TabsTrigger value="offered">+ Angeboten</TabsTrigger>
          <TabsTrigger value="any">Alle</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={filters.gameType} onValueChange={(v) => onChange({ gameType: v as HubFilters["gameType"] })}>
        <TabsList>
          <TabsTrigger value="both">Alle</TabsTrigger>
          <TabsTrigger value="home">Heim</TabsTrigger>
          <TabsTrigger value="away">Auswärts</TabsTrigger>
        </TabsList>
      </Tabs>
      <span className="mx-1 h-5 w-px bg-border/15" />
      {leagues.map((l) => {
        const id = String(l.apiLigaId);
        const on = filters.league.includes(id);
        return (
          <button
            key={id}
            type="button"
            title={l.name}
            onClick={() => toggle(id)}
            className={cn(
              "rounded-4xl px-3 py-1 text-xs font-medium transition-colors",
              on ? "bg-primary text-primary-foreground" : "bg-surface-high text-muted-foreground hover:text-foreground",
            )}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}

function GameCard({ game: g }: { game: Game }) {
  const side = ownSide(g);
  const format = useFormatter();
  const day = format.dateTime(clubDayAnchor(g.kickoffDate), { weekday: "short" });
  return (
    <article
      className={cn(
        "bg-card space-y-2 rounded-md p-3",
        openCount(g) > 0 && relativeDay(g.kickoffDate).match(/heute|morgen|in [1-7] Tagen/) && "ring-heat/60 ring-1",
      )}
    >
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>
          {day} {g.kickoffTime.slice(0, 5)} · {g.leagueShort}
        </span>
        <span>{side.where}</span>
      </div>
      <div className="text-sm leading-snug font-semibold">
        {side.own}
        <span className="text-muted-foreground block text-xs font-normal">
          {side.where === "Heim" ? "gegen" : "bei"} {side.opponent}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ourSlots(g).map((s) => (
          <SlotChip key={s.n} game={g} slot={s} />
        ))}
      </div>
    </article>
  );
}

function SlotChip({ game, slot }: { game: Game; slot: ReturnType<typeof ourSlots>[number] }) {
  const actions = useSlotActions(game);
  const [open, setOpen] = useState(false);

  if (slot.status === "assigned") {
    return (
      <span className="bg-primary/15 text-primary inline-flex max-w-full items-center gap-1 rounded-4xl py-0.5 pr-1 pl-2 text-xs font-medium">
        <span className="truncate">SR{slot.n} {slot.name}</span>
        <button
          type="button"
          aria-label="Entfernen"
          disabled={actions.busy}
          className="rounded-full p-0.5 hover:bg-primary/20"
          onClick={() => void actions.unassign(slot.n)}
        >
          <X className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded-4xl px-2 py-0.5 text-xs font-medium",
            slot.status === "open" ? "bg-heat/15 text-heat hover:bg-heat/25" : "bg-muted text-muted-foreground hover:bg-surface-high",
          )}
        >
          SR{slot.n} {slot.status === "open" ? "besetzen" : "angeboten"} …
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2" align="start">
        <CandidatePicker
          gameApiId={game.apiMatchId}
          slotNumber={slot.n}
          disabled={actions.busy}
          onPick={(id) => {
            void actions.assign(slot.n, id).then(() => setOpen(false));
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
