"use client";

import { useEffect, useRef, useState } from "react";
import type { BroadcastState } from "@dragons/shared";
import { PregameCard } from "./pregame-card";
import { ScoreBug } from "./score-bug";
import { interpolate, shouldDim, type ClockAnchor } from "./clock-interpolation";

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
  const anchorRef = useRef<ClockAnchor | null>(null);
  // performance.now() is impure, so it is read only in effects / event handlers
  // and surfaced to render as state. The interval bumps it ~10x/s.
  const [now, setNow] = useState(0);

  // Seed the anchor from the server-rendered initial snapshot (effect, not
  // render, so the impure performance.now() inside anchorFrom is allowed).
  useEffect(() => {
    anchorRef.current = anchorFrom(initial);
    setNow(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once on mount
  }, []);

  // ~100ms loop advancing the interpolated clocks.
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    const url = `${apiBase}/public/broadcast/stream?deviceId=${encodeURIComponent(
      deviceId,
    )}`;
    const es = new EventSource(url);
    const onSnapshot = (ev: MessageEvent) => {
      try {
        const next = JSON.parse(ev.data) as BroadcastState;
        // Re-anchor at receipt (event handler — impure now() allowed here) so
        // the next render interpolates from the fresh value, no stale frame.
        anchorRef.current = anchorFrom(next);
        setNow(performance.now());
        setState(next);
      } catch {
        // discard
      }
    };
    es.addEventListener("snapshot", onSnapshot);
    return () => {
      es.removeEventListener("snapshot", onSnapshot);
      es.close();
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
    const interp = anchor ? interpolate(anchor, now) : null;
    const stale = shouldDim(state.stale, anchor, now);
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
