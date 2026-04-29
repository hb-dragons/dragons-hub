"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StramatelSnapshot } from "@dragons/shared";

interface Props {
  deviceId: string;
  initialSnapshot: StramatelSnapshot | null;
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const MAX_FOUL_PIPS = 5;
const MAX_TIMEOUT_PIPS = 5;

function Pips({
  value,
  total,
  toneActive,
}: {
  value: number;
  total: number;
  toneActive: string;
}) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`size-3 rounded-full ${
            i < value ? toneActive : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

function TeamPanel({
  side,
  name,
  score,
  fouls,
  timeouts,
  bonus,
  accent,
  pipTone,
  foulsLabel,
  timeoutsLabel,
  bonusLabel,
}: {
  side: "left" | "right";
  name: string;
  score: number;
  fouls: number;
  timeouts: number;
  bonus: boolean;
  accent: string;
  pipTone: string;
  foulsLabel: string;
  timeoutsLabel: string;
  bonusLabel: string;
}) {
  const align = side === "left" ? "items-start" : "items-end";
  const text = side === "left" ? "text-left" : "text-right";
  return (
    <div className={`flex flex-col ${align} gap-4`}>
      <div className={`flex flex-col ${align} gap-2 ${text}`}>
        <span className={`text-2xl font-bold uppercase tracking-widest ${accent}`}>
          {name}
        </span>
        {bonus && (
          <span className="rounded-sm bg-amber-400 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-black">
            {bonusLabel}
          </span>
        )}
      </div>
      <span className="font-black leading-none tabular-nums tracking-tighter [font-size:clamp(6rem,18vw,18rem)]">
        {score}
      </span>
      <div className={`flex flex-col gap-3 ${align}`}>
        <div className={`flex items-center gap-3 ${align}`}>
          <span className="w-20 text-xs uppercase tracking-wider text-white/50">
            {foulsLabel}
          </span>
          <Pips value={fouls} total={MAX_FOUL_PIPS} toneActive={pipTone} />
        </div>
        <div className={`flex items-center gap-3 ${align}`}>
          <span className="w-20 text-xs uppercase tracking-wider text-white/50">
            {timeoutsLabel}
          </span>
          <Pips
            value={timeouts}
            total={MAX_TIMEOUT_PIPS}
            toneActive="bg-white/80"
          />
        </div>
      </div>
    </div>
  );
}

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

  const homeBonus = snap.foulsHome >= 5;
  const guestBonus = snap.foulsGuest >= 5;
  const periodLabel = snap.period > 0 ? `${t("period")}${snap.period}` : t("period");

  return (
    <div className="relative flex w-full max-w-7xl flex-col gap-10 p-6 sm:p-10">
      {/* Top bar */}
      <div className="flex items-center justify-between text-white/60">
        <span className="text-xs uppercase tracking-[0.3em]">{t("title")}</span>
        <span className="flex items-center gap-2">
          <span className={`inline-block size-2 rounded-full ${dot}`} />
          <span className="text-xs uppercase tracking-wider">{t(status)}</span>
        </span>
      </div>

      {/* Main board */}
      <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-[1fr_auto_1fr]">
        <TeamPanel
          side="left"
          name={t("home")}
          score={snap.scoreHome}
          fouls={snap.foulsHome}
          timeouts={snap.timeoutsHome}
          bonus={homeBonus}
          accent="text-sky-400"
          pipTone="bg-sky-400"
          foulsLabel={t("fouls")}
          timeoutsLabel={t("timeouts")}
          bonusLabel={t("bonus")}
        />

        {/* Center cluster */}
        <div className="flex flex-col items-center gap-4">
          <span className="rounded-full bg-white/10 px-4 py-1 text-sm font-bold uppercase tracking-widest text-white/80">
            {periodLabel}
          </span>
          <span
            className={`font-black leading-none tabular-nums tracking-tighter [font-size:clamp(5rem,14vw,12rem)] ${
              snap.clockRunning ? "text-white" : "text-white/40"
            }`}
          >
            {snap.clockText || "--:--"}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-white/50">
              {t("shotClock")}
            </span>
            <span className="rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1 font-mono text-3xl font-black tabular-nums text-rose-400">
              {String(snap.shotClock).padStart(2, "0")}
            </span>
          </div>
          {snap.timeoutActive && (
            <span className="mt-2 animate-pulse rounded-md bg-amber-400 px-3 py-1 text-sm font-black uppercase tracking-widest text-black">
              {t("timeoutActive")}
            </span>
          )}
        </div>

        <TeamPanel
          side="right"
          name={t("guest")}
          score={snap.scoreGuest}
          fouls={snap.foulsGuest}
          timeouts={snap.timeoutsGuest}
          bonus={guestBonus}
          accent="text-rose-400"
          pipTone="bg-rose-400"
          foulsLabel={t("fouls")}
          timeoutsLabel={t("timeouts")}
          bonusLabel={t("bonus")}
        />
      </div>
    </div>
  );
}
