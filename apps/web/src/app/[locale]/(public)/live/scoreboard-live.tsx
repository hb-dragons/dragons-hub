"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StramatelSnapshot } from "@dragons/shared";

interface Props {
  deviceId: string;
  initialSnapshot: StramatelSnapshot | null;
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ScoreboardLive({ deviceId, initialSnapshot }: Props) {
  const t = useTranslations("scoreboard.live");
  const [snap, setSnap] = useState<StramatelSnapshot | null>(initialSnapshot);
  const [status, setStatus] = useState<"connecting" | "online" | "offline">(
    initialSnapshot ? "online" : "connecting",
  );
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    const url = `${apiBase}/public/scoreboard/stream?deviceId=${encodeURIComponent(deviceId)}`;
    const es = new EventSource(url);
    esRef.current = es;
    const onSnap = (ev: MessageEvent) => {
      try {
        const next = JSON.parse(ev.data) as StramatelSnapshot;
        setSnap(next);
        setStatus("online");
      } catch {
        // ignore malformed
      }
    };
    const onError = () => setStatus("offline");
    const onOpen = () => setStatus("online");
    es.addEventListener("snapshot", onSnap);
    es.addEventListener("error", onError);
    es.addEventListener("open", onOpen);
    return () => {
      es.removeEventListener("snapshot", onSnap);
      es.removeEventListener("error", onError);
      es.removeEventListener("open", onOpen);
      es.close();
      esRef.current = null;
    };
  }, [deviceId]);

  if (!snap) {
    return (
      <div className="text-2xl text-zinc-400" role="status">
        {t("offline")}
      </div>
    );
  }

  const dot =
    status === "online"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between text-zinc-400">
        <span className="uppercase tracking-widest">{t("title")}</span>
        <span className="flex items-center gap-2">
          <span className={`inline-block size-2 rounded-full ${dot}`} />
          <span className="text-sm">{t(status)}</span>
        </span>
      </div>
      <div className="grid grid-cols-3 items-center gap-4 text-center">
        <span className="text-9xl font-black tabular-nums">{snap.scoreHome}</span>
        <div className="flex flex-col items-center gap-2">
          <span className="text-xl uppercase text-zinc-400">
            {t("period")} {snap.period}
          </span>
          <span className="text-7xl font-bold tabular-nums">{snap.clockText}</span>
          <span className="text-xl tabular-nums text-zinc-400">
            {t("shotClock")} {snap.shotClock}
          </span>
        </div>
        <span className="text-9xl font-black tabular-nums">{snap.scoreGuest}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 text-zinc-400">
        <span>
          {t("fouls")} {snap.foulsHome} · {t("timeouts")} {snap.timeoutsHome}
        </span>
        <span className="text-right">
          {t("fouls")} {snap.foulsGuest} · {t("timeouts")} {snap.timeoutsGuest}
        </span>
      </div>
    </div>
  );
}
