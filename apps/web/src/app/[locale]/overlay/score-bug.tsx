"use client";

import { useEffect, useState } from "react";
import type { BroadcastMatch, PublicLiveSnapshot } from "@dragons/shared";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const MAX_FOUL_PIPS = 5;
const SHOT_CLOCK_RED_AT = 5;

function logoUrl(clubId: number): string {
  return `${apiBase}/assets/clubs/${clubId}.webp`;
}

interface Props {
  match: BroadcastMatch;
  scoreboard: PublicLiveSnapshot;
  stale: boolean;
}

export function ScoreBug({ match, scoreboard, stale }: Props) {
  return (
    <div
      className="absolute"
      style={{
        bottom: "4vh",
        left: "4vw",
        width: "min(560px, 60vw)",
        opacity: stale ? 0.5 : 1,
        transition: "opacity 200ms",
      }}
    >
      <div
        className="overflow-hidden rounded-lg"
        style={{
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(6px)",
        }}
      >
        <TeamRow
          team={match.home}
          score={scoreboard.scoreHome}
          fouls={scoreboard.foulsHome}
        />
        <div
          className="flex items-center gap-2 border-t border-white/10 px-3 py-2"
        >
          <PeriodClock
            period={scoreboard.period}
            clockText={scoreboard.clockText}
            clockRunning={scoreboard.clockRunning}
          />
          <ShotClock value={scoreboard.shotClock} />
        </div>
        <TeamRow
          team={match.guest}
          score={scoreboard.scoreGuest}
          fouls={scoreboard.foulsGuest}
        />
      </div>
    </div>
  );
}

function TeamRow({
  team,
  score,
  fouls,
}: {
  team: BroadcastMatch["home"];
  score: number;
  fouls: number;
}) {
  return (
    <div className="grid items-center gap-2 px-3 py-2"
         style={{ gridTemplateColumns: "auto auto 1fr auto" }}>
      <div
        style={{
          width: "1rem",
          height: "2rem",
          background: team.color,
        }}
      />
      <img
        src={logoUrl(team.clubId)}
        alt={team.name}
        style={{ width: "32px", height: "32px", objectFit: "contain" }}
      />
      <div className="flex items-center gap-3">
        <span
          className="font-black uppercase tracking-wider"
          style={{ fontSize: "1.5rem" }}
        >
          {team.abbr}
        </span>
        <FoulPips fouls={fouls} />
      </div>
      <AnimatedScore value={score} />
    </div>
  );
}

function FoulPips({ fouls }: { fouls: number }) {
  const bonus = fouls >= MAX_FOUL_PIPS;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: MAX_FOUL_PIPS }, (_, i) => (
        <span
          key={i}
          style={{
            width: "0.6rem",
            height: "0.6rem",
            borderRadius: "9999px",
            background:
              i < fouls
                ? bonus
                  ? "rgb(250 204 21)"
                  : "rgb(244 63 94)"
                : "rgba(255,255,255,0.2)",
          }}
        />
      ))}
      {bonus && (
        <span
          className="ml-1 rounded bg-amber-400 px-1 font-black uppercase text-black"
          style={{ fontSize: "0.7rem" }}
        >
          BONUS
        </span>
      )}
    </div>
  );
}

function AnimatedScore({ value }: { value: number }) {
  const [prev, setPrev] = useState(value);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (value !== prev) {
      setPop(true);
      setPrev(value);
      const t = setTimeout(() => setPop(false), 200);
      return () => clearTimeout(t);
    }
  }, [value, prev]);
  return (
    <span
      className="font-black tabular-nums"
      style={{
        fontSize: "2.5rem",
        transform: pop ? "scale(1.15)" : "scale(1)",
        transition: "transform 200ms",
      }}
    >
      {value}
    </span>
  );
}

function PeriodClock({
  period,
  clockText,
  clockRunning,
}: {
  period: number;
  clockText: string;
  clockRunning: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider"
      >
        {period > 0 ? `Q${period}` : "—"}
      </span>
      <span
        className="font-black tabular-nums"
        style={{
          fontSize: "1.6rem",
          color: clockRunning ? "white" : "rgba(255,255,255,0.6)",
        }}
      >
        {clockText || "--:--"}
      </span>
    </div>
  );
}

function ShotClock({ value }: { value: number }) {
  const red = value > 0 && value <= SHOT_CLOCK_RED_AT;
  return (
    <span
      className="ml-auto rounded font-black tabular-nums"
      style={{
        fontSize: "1.4rem",
        padding: "0.1rem 0.5rem",
        background: red ? "rgba(244,63,94,0.2)" : "rgba(255,255,255,0.1)",
        color: red ? "rgb(244 63 94)" : "white",
        border: `1px solid ${red ? "rgb(244 63 94)" : "rgba(255,255,255,0.2)"}`,
      }}
    >
      {String(value).padStart(2, "0")}
    </span>
  );
}
