/**
 * Live scoreboard island on home (plan Task C6): initial state from
 * GET /public/scoreboard/latest, then the /public/scoreboard/stream SSE feed
 * with exponential-backoff reconnect. Renders nothing at all unless a game is
 * live right now — every connect/hide/backoff decision lives in
 * lib/scoreboard.ts (unit-tested); this file only wires the browser built-ins
 * and the markup.
 */
import { useEffect, useState } from "react";
import { Badge } from "@dragons/ui/components/badge";
import { DEFAULT_API_BASE } from "../../lib/api-base";
import {
  DEFAULT_SCOREBOARD_DEVICE_ID,
  startScoreboardClient,
  type LiveSnapshot,
} from "../../lib/scoreboard";
import { strings } from "../../lib/strings";

const API_BASE =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ?? DEFAULT_API_BASE;
const DEVICE_ID =
  (import.meta.env.PUBLIC_SCOREBOARD_DEVICE_ID as string | undefined) ??
  DEFAULT_SCOREBOARD_DEVICE_ID;

function TeamScore({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-4xl md:text-6xl font-mono font-black tabular-nums">{score}</span>
      <Badge variant="secondary" className="text-xs md:text-sm">
        {label}
      </Badge>
    </div>
  );
}

export default function ScoreboardIsland() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);

  useEffect(
    () =>
      startScoreboardClient({
        baseUrl: API_BASE,
        deviceId: DEVICE_ID,
        onChange: setSnapshot,
        fetchImpl: (url) => fetch(url),
        createEventSource: (url) => new EventSource(url),
        now: () => Date.now(),
        schedule: (fn, ms) => window.setTimeout(fn, ms),
        cancel: (handle) => window.clearTimeout(handle as number),
      }),
    [],
  );

  if (snapshot === null) return null;

  return (
    <section
      aria-label={strings.scoreboard.sectionLabel}
      className="max-w-7xl mx-auto px-4 pt-8 md:pt-10"
    >
      <div className="bg-card border-2 rounded-md px-4 py-5 md:px-8 md:py-7 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75"></span>
            <span className="relative inline-flex size-2.5 rounded-full bg-destructive"></span>
          </span>
          <Badge variant="destructive" className="uppercase tracking-wider font-bold">
            {strings.scoreboard.liveBadge}
          </Badge>
        </div>
        <div className="flex items-center gap-6 md:gap-12">
          <TeamScore label={strings.scoreboard.home} score={snapshot.scoreHome} />
          <span className="text-2xl md:text-4xl font-mono font-bold text-muted-foreground">:</span>
          <TeamScore label={strings.scoreboard.guest} score={snapshot.scoreGuest} />
        </div>
        <div className="flex items-center gap-3 font-mono text-sm md:text-base text-muted-foreground">
          {snapshot.period > 0 && (
            <span className="bg-muted px-2 py-0.5 rounded-lg border font-semibold">
              {strings.scoreboard.periodPrefix}
              {snapshot.period}
            </span>
          )}
          <span className={`tabular-nums ${snapshot.clockRunning ? "" : "opacity-60"}`}>
            {snapshot.clockText}
          </span>
        </div>
      </div>
    </section>
  );
}
