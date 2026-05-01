"use client";

import { useEffect, useRef, useState } from "react";
import type { BroadcastState } from "@dragons/shared";
import { PregameCard } from "./pregame-card";
import { ScoreBug } from "./score-bug";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Props {
  deviceId: string;
  initial: BroadcastState | null;
}

export function OverlayClient({ deviceId, initial }: Props) {
  const [state, setState] = useState<BroadcastState | null>(initial);
  const esRef = useRef<EventSource | null>(null);

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
    return (
      <ScoreBug
        match={state.match}
        scoreboard={state.scoreboard}
        stale={state.stale}
      />
    );
  }
  return null;
}
