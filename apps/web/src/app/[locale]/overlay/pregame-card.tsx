"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import type { BroadcastMatch } from "@dragons/shared";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function logoUrl(clubId: number): string {
  return `${apiBase}/public/assets/clubs/${clubId}.webp`;
}

export function PregameCard({ match }: { match: BroadcastMatch }) {
  const locale = useLocale();
  const dateLabel = useMemo(
    () => formatDate(locale, match.kickoffDate),
    [locale, match.kickoffDate],
  );
  const time = match.kickoffTime.slice(0, 5);

  return (
    <div className="absolute bottom-[8vh] left-1/2 w-[min(820px,80vw)] -translate-x-1/2">
      <div className="relative overflow-hidden rounded-md bg-black/85 backdrop-blur-md drop-shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
        <ColorBars home={match.home.color} guest={match.guest.color} />

        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <TeamSide team={match.home} side="left" />
          <CenterInfo
            league={match.league?.name ?? ""}
            time={time}
            dateLabel={dateLabel}
          />
          <TeamSide team={match.guest} side="right" />
        </div>

        <ColorBars home={match.home.color} guest={match.guest.color} />
      </div>
    </div>
  );
}

function ColorBars({ home, guest }: { home: string; guest: string }) {
  return (
    <div aria-hidden className="grid h-1.5 grid-cols-2">
      <div style={{ background: home }} />
      <div style={{ background: guest }} />
    </div>
  );
}

function TeamSide({
  team,
  side,
}: {
  team: BroadcastMatch["home"];
  side: "left" | "right";
}) {
  const align = side === "left" ? "items-start text-left" : "items-end text-right";
  return (
    <div className={`flex flex-col gap-3 px-8 py-7 ${align}`}>
      <img
        src={logoUrl(team.clubId)}
        alt={team.name}
        className="size-[104px] object-contain"
      />
      <div className="font-display text-[clamp(1.25rem,2vw,1.75rem)] font-black uppercase leading-[1.05] tracking-tight text-white">
        {team.name}
      </div>
      <div className="font-display text-xs font-bold uppercase tracking-[0.25em] text-white/55">
        {team.abbr}
      </div>
    </div>
  );
}

function CenterInfo({
  league,
  time,
  dateLabel,
}: {
  league: string;
  time: string;
  dateLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-7">
      {league && (
        <span className="font-display text-xs font-bold uppercase tracking-[0.3em] text-white/65">
          {league}
        </span>
      )}
      <span className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] font-black leading-none tabular-nums text-white">
        {time}
      </span>
      <span className="font-display text-xs font-medium uppercase tracking-[0.25em] text-white/65">
        {dateLabel}
      </span>
      <span className="bg-heat text-heat-foreground mt-1 rounded-sm px-2 py-0.5 font-display text-[0.7rem] font-black uppercase tracking-widest">
        Tip-off
      </span>
    </div>
  );
}

function formatDate(locale: string, isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).format(new Date(y, m - 1, d));
  } catch {
    return isoDate;
  }
}
