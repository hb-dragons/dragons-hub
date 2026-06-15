"use client";

import { useEffect, useRef, useState } from "react";
import type { BroadcastState } from "@dragons/shared";
import { PregameCard } from "./pregame-card";
import { ScoreBug } from "./score-bug";
import { interpolate, isStale, type ClockAnchor } from "./clock-interpolation";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Props {
  deviceId: string;
  initial: BroadcastState | null;
}

function anchorFrom(state: BroadcastState | null): ClockAnchor | null {
  const s = state?.scoreboard;
  if (!s) return null;
  return {
    clockMs: s.clockMs,
    clockText: s.clockText,
    shotClock: s.shotClock,
    shotClockText: s.shotClockText,
    clockRunning: s.clockRunning,
    timeoutActive: s.timeoutActive,
    anchorAt: performance.now(),
  };
}

export function OverlayClient({ deviceId, initial }: Props) {
  const [state, setState] = useState<BroadcastState | null>(initial);
  const anchorRef = useRef<ClockAnchor | null>(anchorFrom(initial));
  const [, setTick] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  // Re-anchor whenever a new broadcast state arrives.
  useEffect(() => {
    anchorRef.current = anchorFrom(state);
  }, [state]);

  // ~100ms render loop so the interpolated clocks advance smoothly.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    const url = `${apiBase}/public/broadcast/stream?deviceId=${encodeURIComponent(
      deviceId,
    )}`;
    const es = new EventSource(url);
    esRef.current = es;
    const onSnapshot = (ev: MessageEvent) => {
      try {
        setState(JSON.parse(ev.data) as BroadcastState);
      } catch {
        // discard
      }
    };
    es.addEventListener("snapshot", onSnapshot);
    return () => {
      es.removeEventListener("snapshot", onSnapshot);
      es.close();
      esRef.current = null;
    };
  }, [deviceId]);

  if (!state || state.phase === "idle") {
    // OBS source stays loaded but invisible.
    return null;
  }

  if (state.phase === "pregame" && state.match) {
    return <PregameCard match={state.match} />;
  }

  if (state.phase === "live" && state.match && state.scoreboard) {
    const anchor = anchorRef.current;
    const now = performance.now();
    const interp = anchor ? interpolate(anchor, now) : null;
    const stale = state.stale || (anchor ? isStale(anchor, now) : false);
    const scoreboard = interp
      ? {
          ...state.scoreboard,
          clockText: interp.clockText,
          shotClockText: interp.shotClockText,
        }
      : state.scoreboard;
    return <ScoreBug match={state.match} scoreboard={scoreboard} stale={stale} />;
  }
  return null;
}
