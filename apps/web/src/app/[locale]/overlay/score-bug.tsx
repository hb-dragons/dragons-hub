"use client";

import type { ReactNode } from "react";
import NumberFlow, { NumberFlowGroup } from "@number-flow/react";
import type { BroadcastMatch, PublicLiveSnapshot } from "@dragons/shared";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// FIBA Art. 41.1.1: team-foul limit reached at 4 fouls/quarter. The 5th cell
// is a bonus indicator (lights at >=4), not a 5th countable foul.
const MAX_FOUL_PIPS = 5;
const TEAM_FOUL_BONUS_AT = 4;
// UI-only convention; DBB/FIBA rules don't define a low-shot-clock threshold.
const SHOT_CLOCK_RED_AT = 5;
// FIBA Art. 18.2.5: H1 (Q1+Q2) = 2 timeouts, H2 (Q3+Q4) = 3, each OT = 1.
// Pool resets at halftime / each OT, so render exactly the period's allotment.
function timeoutPipsForPeriod(period: number): number {
  if (period <= 2) return 2;
  if (period <= 4) return 3;
  return 1;
}

function logoUrl(clubId: number): string {
  return `${apiBase}/public/assets/clubs/${clubId}.webp`;
}

function PeriodBadge({ period }: { period: number }): ReactNode {
  if (period <= 0) return "—";
  if (period <= 4) {
    const suffix = (["ST", "ND", "RD", "TH"] as const)[period - 1];
    return (
      <span className="inline-flex items-baseline gap-px whitespace-nowrap leading-none tracking-normal">
        <span className="tabular-nums">{period}</span>
        <sup className="-top-[0.35em] relative text-[0.58em] font-bold">{suffix}</sup>
      </span>
    );
  }
  if (period === 5) {
    return <span className="tracking-[0.2em]">OT</span>;
  }
  return (
    <span className="tracking-[0.2em]">
      OT<span className="tabular-nums">{period - 4}</span>
    </span>
  );
}

interface Props {
  match: BroadcastMatch;
  scoreboard: PublicLiveSnapshot;
  stale: boolean;
}

export function ScoreBug({ match, scoreboard, stale }: Props) {
  return (
    <div
      className={`absolute drop-shadow-[0_12px_32px_rgba(0,0,0,0.55)] transition-opacity duration-200 ${stale ? "opacity-50" : "opacity-100"
        }`}
      style={{ zoom: 2 }}
    >
      <div className="flex items-stretch justify-center font-display">
        <div className="flex h-20 items-stretch overflow-hidden rounded-lg bg-surface-low">
          <LogoCap team={match.home} />
          <TeamPanel
            abbr={match.home.abbr}
            fouls={scoreboard.foulsHome}
            timeouts={scoreboard.timeoutsHome}
            period={scoreboard.period}
          />
          <div className="flex items-start gap-2">
            <div className="bg-surface-highest flex px-4 py-1.5 rounded-b-xl gap-4">
              <ScoreCell value={scoreboard.scoreHome} />
              <div className="flex w-0.5 py-2">
                <div className="flex-1 bg-primary"></div>
              </div>
              <ScoreCell value={scoreboard.scoreGuest} />
            </div>
          </div>
          <TeamPanel
            abbr={match.guest.abbr}
            fouls={scoreboard.foulsGuest}
            timeouts={scoreboard.timeoutsGuest}
            period={scoreboard.period}
          />
          <LogoCap team={match.guest} />
        </div>
        <div className="flex justify-center items-center">
          <div className="flex">
            <ClockCell clockText={scoreboard.clockText} period={scoreboard.period} />
            <div className="flex justify-center items-center">
              <div className="-ml-4 flex justify-center items-center bg-surface-high rounded-md overflow-hidden">
                <ShotClockCap
                  shotClock={scoreboard.shotClock}
                  timeoutActive={scoreboard.timeoutActive}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoCap({ team }: { team: BroadcastMatch["home"] }) {
  return (
    <div className="flex shrink-0 items-center justify-center p-2">
      <img
        src={logoUrl(team.clubId)}
        alt={team.name}
        className="h-full w-full max-h-13 object-contain filter-[drop-shadow(0.5px_0_0_var(--color-surface-highest))_drop-shadow(-0.5px_0_0_var(--color-surface-highest))_drop-shadow(0_0.5px_0_var(--color-surface-highest))_drop-shadow(0_-0.5px_0_var(--color-surface-highest))]"
      />
    </div>
  );
}

function TeamPanel({
  abbr,
  fouls,
  timeouts,
  period,
}: {
  abbr: string;
  fouls: number;
  timeouts: number;
  period: number;
}) {
  return (
    <div
      className="flex w-28 shrink-0 flex-col items-center mt-4 px-3 relative"
    >
      <div className="text-4xl font-bold italic leading-none tracking-tight text-white">
        {abbr}
      </div>
      <div className="flex flex-col justify-center items-center gap-1.5 absolute bottom-2 left-0 right-0">
        <FoulPips fouls={fouls} />
        <TimeoutPips timeouts={timeouts} period={period} />
      </div>
    </div>
  );
}

function ScoreCell({ value }: { value: number }) {
  return (
    <div className="flex w-20 shrink-0 items-center justify-center">
      <NumberFlow
        value={value}
        format={{ maximumFractionDigits: 0, useGrouping: false }}
        className="text-[2.7rem] font-black tabular-nums leading-[0.85] text-white"
        willChange
      />
    </div>
  );
}

function ClockCell({
  clockText,
  period,
}: {
  clockText: string;
  period: number;
}) {
  return (
    <div
      className="w-28 flex shrink-0 flex-col bg-surface-lowest rounded-r-lg py-2 px-4"
    >
      <span className="text-2xl font-black tabular-nums leading-none">
        {clockText || "--:--"}
      </span>
      <span className="text-lg font-bold uppercase">
        <PeriodBadge period={period} />
      </span>
    </div>
  );
}

function ShotClockCap({
  shotClock,
  timeoutActive,
}: {
  shotClock: number;
  timeoutActive: boolean;
}) {
  if (timeoutActive) {
    return (
      <div
        className="flex w-12 h-8 shrink-0 items-center justify-center bg-red-500"
        aria-label="Timeout"
      >
        <span className="text-xl font-black uppercase text-white">
          TO
        </span>
      </div>
    );
  }
  const red = shotClock > 0 && shotClock <= SHOT_CLOCK_RED_AT;
  return (
    <div
      className="flex w-12 h-8 shrink-0 items-center justify-center"
    >
      <div className="rounded-md p-1">
        <span
          className={`text-2xl font-bold tabular-nums leading-none ${red ? "text-heat" : "text-white"
            }`}
        >
          {String(shotClock).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

function FoulPips({ fouls }: { fouls: number }) {
  const filled = Math.min(Math.max(fouls, 0), MAX_FOUL_PIPS);
  const bonus = fouls >= TEAM_FOUL_BONUS_AT;
  return (
    <div className="flex items-center gap-1" aria-label={`Fouls ${fouls}`}>
      {Array.from({ length: MAX_FOUL_PIPS }, (_, i) => {
        const isBonus = i === MAX_FOUL_PIPS - 1;
        const active = isBonus ? bonus : i < filled;
        const cls = active
          ? isBonus
            ? "bg-red-500"
            : "bg-white"
          : "bg-white/20";
        return <span key={i} className={`size-1.5 rounded-full ${cls}`} />;
      })}
    </div>
  );
}

function TimeoutPips({ timeouts, period }: { timeouts: number; period: number }) {
  const total = timeoutPipsForPeriod(period);
  const filled = Math.min(Math.max(timeouts, 0), total);
  return (
    <div className="flex items-center gap-1" aria-label={`Timeouts ${filled}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-[3px] w-3 rounded-[1px] ${i < filled ? "bg-white/85" : "bg-white/20"
            }`}
        />
      ))}
    </div>
  );
}

