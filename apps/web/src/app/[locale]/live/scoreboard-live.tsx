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

// Inline sizes are intentional: Tailwind v4's JIT scanner has been unreliable
// for arbitrary values on this file path (brackets + parens in the route
// segment), and we want the typography to be huge and exact. Using `style`
// sidesteps the scanner entirely.
const SIZE_SCORE = "clamp(8rem, 22vw, 22rem)";
const SIZE_CLOCK = "clamp(6rem, 16vw, 14rem)";
const SIZE_TEAM = "clamp(1.5rem, 3vw, 2.5rem)";
const SIZE_FOULS_NUM = "clamp(2rem, 4vw, 3.5rem)";
const SIZE_PERIOD = "clamp(1rem, 1.6vw, 1.5rem)";
const SIZE_SHOT_LABEL = "clamp(0.75rem, 1.1vw, 1rem)";
const SIZE_SHOT = "clamp(2rem, 4vw, 3.5rem)";
const SIZE_PIP = "clamp(0.75rem, 1.4vw, 1.25rem)";
const SIZE_LABEL = "clamp(0.75rem, 1vw, 1rem)";
const SIZE_TIMEOUT_BADGE = "clamp(0.875rem, 1.4vw, 1.5rem)";

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
    <div className="flex gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`rounded-full ${i < value ? toneActive : "bg-white/15"}`}
          style={{ width: SIZE_PIP, height: SIZE_PIP }}
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
  // Numbers face inward toward the center clock (traditional scoreboard look).
  const align = side === "left" ? "items-end" : "items-start";

  return (
    <div className={`flex flex-col gap-6 ${align}`}>
      <div className="flex items-center gap-3">
        <span
          className={`font-black uppercase tracking-[0.25em] ${accent}`}
          style={{ fontSize: SIZE_TEAM }}
        >
          {name}
        </span>
        {bonus && (
          <span
            className="rounded-sm bg-amber-400 px-2 py-0.5 font-black uppercase tracking-wider text-black"
            style={{ fontSize: SIZE_LABEL }}
          >
            {bonusLabel}
          </span>
        )}
      </div>
      <span
        className="font-black leading-none tabular-nums tracking-tighter"
        style={{ fontSize: SIZE_SCORE }}
      >
        {score}
      </span>
      <div className={`flex flex-col gap-3 ${align}`}>
        <div className="flex items-center gap-3">
          <span
            className="uppercase tracking-wider text-white/50"
            style={{ fontSize: SIZE_LABEL }}
          >
            {foulsLabel}
          </span>
          <span
            className={`font-mono font-black tabular-nums ${accent}`}
            style={{ fontSize: SIZE_FOULS_NUM, minWidth: "1.5em" }}
          >
            {fouls}
          </span>
          <Pips value={fouls} total={MAX_FOUL_PIPS} toneActive={pipTone} />
        </div>
        <div className="flex items-center gap-3">
          <span
            className="uppercase tracking-wider text-white/50"
            style={{ fontSize: SIZE_LABEL }}
          >
            {timeoutsLabel}
          </span>
          <span
            className="font-mono font-black tabular-nums text-white"
            style={{ fontSize: SIZE_FOULS_NUM, minWidth: "1.5em" }}
          >
            {timeouts}
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
      <div
        className="flex min-h-screen items-center justify-center text-2xl text-zinc-400"
        role="status"
      >
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
  const periodLabel =
    snap.period > 0 ? `${t("period")}${snap.period}` : t("period");

  return (
    <div className="flex min-h-screen w-full flex-col gap-8 p-6 sm:p-10">
      {/* Top bar — connection status only */}
      <div className="flex items-center justify-end text-white/60">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
          <span
            className="uppercase tracking-wider"
            style={{ fontSize: SIZE_LABEL }}
          >
            {t(status)}
          </span>
        </span>
      </div>

      {/* Main board fills the remaining viewport height */}
      <div
        className="grid flex-1 items-center gap-6 sm:gap-12"
        style={{ gridTemplateColumns: "1fr auto 1fr" }}
      >
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
        <div className="flex flex-col items-center gap-5">
          <span
            className="rounded-full bg-white/10 px-5 py-1.5 font-bold uppercase tracking-widest text-white/80"
            style={{ fontSize: SIZE_PERIOD }}
          >
            {periodLabel}
          </span>
          <span
            className={`font-black leading-none tabular-nums tracking-tighter ${
              snap.clockRunning ? "text-white" : "text-white/40"
            }`}
            style={{ fontSize: SIZE_CLOCK }}
          >
            {snap.clockText || "--:--"}
          </span>
          <div className="flex items-center gap-3">
            <span
              className="uppercase tracking-wider text-white/50"
              style={{ fontSize: SIZE_SHOT_LABEL }}
            >
              {t("shotClock")}
            </span>
            <span
              className="rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1 font-mono font-black tabular-nums text-rose-400"
              style={{ fontSize: SIZE_SHOT }}
            >
              {String(snap.shotClock).padStart(2, "0")}
            </span>
          </div>
          {snap.timeoutActive && (
            <span
              className="mt-2 animate-pulse rounded-md bg-amber-400 px-3 py-1 font-black uppercase tracking-widest text-black"
              style={{ fontSize: SIZE_TIMEOUT_BADGE }}
            >
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
