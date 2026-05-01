"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StramatelSnapshot } from "@dragons/shared";

interface Props {
  deviceId: string;
  initialSnapshot: StramatelSnapshot | null;
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// FIBA Art. 41.1.1: team-foul limit reached at 4 fouls/quarter; bonus state
// begins at 4 (next foul → 2 FTs).
const MAX_FOUL_PIPS = 5;
const TEAM_FOUL_BONUS_AT = 4;
// FIBA Art. 18.2.5: H1 (Q1+Q2) = 2 timeouts, H2 (Q3+Q4) = 3, each OT = 1.
function timeoutPipsForPeriod(period: number): number {
  if (period <= 2) return 2;
  if (period <= 4) return 3;
  return 1;
}
// UI-only convention; DBB/FIBA rules don't define a low-shot-clock threshold.
const SHOT_CLOCK_RED_AT = 5;

// Inline sizes are intentional: this view targets full-screen projectors and
// landscape phones, where exact `clamp()` typography matters more than fitting
// into Tailwind's preset scale.
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
          className={`rounded-full ${i < value ? toneActive : "bg-foreground/15"}`}
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
  timeoutsTotal,
  bonus,
  accentText,
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
  timeoutsTotal: number;
  bonus: boolean;
  accentText: string;
  pipTone: string;
  foulsLabel: string;
  timeoutsLabel: string;
  bonusLabel: string;
}) {
  const align = side === "left" ? "items-end" : "items-start";

  return (
    <div className={`flex flex-col gap-6 ${align}`}>
      <div className="flex items-center gap-3">
        <span
          className={`font-display font-black uppercase tracking-[0.25em] ${accentText}`}
          style={{ fontSize: SIZE_TEAM }}
        >
          {name}
        </span>
        {bonus && (
          <span
            className="bg-heat text-heat-foreground rounded-md px-2 py-0.5 font-display font-black uppercase tracking-wider"
            style={{ fontSize: SIZE_LABEL }}
          >
            {bonusLabel}
          </span>
        )}
      </div>
      <span
        className="font-display font-black leading-none tabular-nums tracking-tighter"
        style={{ fontSize: SIZE_SCORE }}
      >
        {score}
      </span>
      <div className={`flex flex-col gap-3 ${align}`}>
        <div className="flex items-center gap-3">
          <span
            className="font-display uppercase tracking-wider text-muted-foreground"
            style={{ fontSize: SIZE_LABEL }}
          >
            {foulsLabel}
          </span>
          <span
            className={`font-mono font-black tabular-nums ${accentText}`}
            style={{ fontSize: SIZE_FOULS_NUM, minWidth: "1.5em" }}
          >
            {fouls}
          </span>
          <Pips value={fouls} total={MAX_FOUL_PIPS} toneActive={pipTone} />
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-display uppercase tracking-wider text-muted-foreground"
            style={{ fontSize: SIZE_LABEL }}
          >
            {timeoutsLabel}
          </span>
          <span
            className="font-mono font-black tabular-nums text-foreground"
            style={{ fontSize: SIZE_FOULS_NUM, minWidth: "1.5em" }}
          >
            {timeouts}
          </span>
          <Pips
            value={timeouts}
            total={timeoutsTotal}
            toneActive="bg-foreground/80"
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
        className="flex min-h-screen items-center justify-center font-display text-2xl uppercase tracking-wider text-muted-foreground"
        role="status"
      >
        {t("offline")}
      </div>
    );
  }

  const dot =
    status === "online"
      ? "bg-primary"
      : status === "connecting"
        ? "bg-heat"
        : "bg-destructive";

  const homeBonus = snap.foulsHome >= TEAM_FOUL_BONUS_AT;
  const guestBonus = snap.foulsGuest >= TEAM_FOUL_BONUS_AT;
  const timeoutsTotal = timeoutPipsForPeriod(snap.period);
  const periodLabel =
    snap.period > 0 ? `${t("period")}${snap.period}` : t("period");
  const shotLow = snap.shotClock > 0 && snap.shotClock <= SHOT_CLOCK_RED_AT;

  return (
    <div className="flex min-h-screen w-full flex-col gap-8 p-6 sm:p-10">
      <div className="flex items-center justify-end text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
          <span
            className="font-display uppercase tracking-wider"
            style={{ fontSize: SIZE_LABEL }}
          >
            {t(status)}
          </span>
        </span>
      </div>

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
          timeoutsTotal={timeoutsTotal}
          bonus={homeBonus}
          accentText="text-primary"
          pipTone="bg-primary"
          foulsLabel={t("fouls")}
          timeoutsLabel={t("timeouts")}
          bonusLabel={t("bonus")}
        />

        <div className="flex flex-col items-center gap-5">
          <span
            className="bg-foreground/10 rounded-4xl px-5 py-1.5 font-display font-bold uppercase tracking-widest text-foreground/80"
            style={{ fontSize: SIZE_PERIOD }}
          >
            {periodLabel}
          </span>
          <span
            className={`font-display font-black leading-none tabular-nums tracking-tighter ${
              snap.clockRunning ? "text-foreground" : "text-foreground/40"
            }`}
            style={{ fontSize: SIZE_CLOCK }}
          >
            {snap.clockText || "--:--"}
          </span>
          <div className="flex items-center gap-3">
            <span
              className="font-display uppercase tracking-wider text-muted-foreground"
              style={{ fontSize: SIZE_SHOT_LABEL }}
            >
              {t("shotClock")}
            </span>
            <span
              className={`rounded-md px-3 py-1 font-mono font-black tabular-nums ${
                shotLow
                  ? "bg-heat/15 text-heat"
                  : "bg-foreground/10 text-foreground"
              }`}
              style={{ fontSize: SIZE_SHOT }}
            >
              {String(snap.shotClock).padStart(2, "0")}
            </span>
          </div>
          {snap.timeoutActive && (
            <span
              className="bg-heat text-heat-foreground mt-2 animate-pulse rounded-md px-3 py-1 font-display font-black uppercase tracking-widest"
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
          timeoutsTotal={timeoutsTotal}
          bonus={guestBonus}
          accentText="text-heat"
          pipTone="bg-heat"
          foulsLabel={t("fouls")}
          timeoutsLabel={t("timeouts")}
          bonusLabel={t("bonus")}
        />
      </div>
    </div>
  );
}
