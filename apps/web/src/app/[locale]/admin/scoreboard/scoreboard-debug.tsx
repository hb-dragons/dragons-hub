"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import type {
  ScoreboardHealth,
  ScoreboardSnapshotRow,
  StramatelSnapshot,
} from "@dragons/shared";
import { api } from "@/lib/api";

interface PublishEvent extends StramatelSnapshot {
  deviceId: string;
  snapshotId: number | null;
  changed: boolean;
  lastFrameAt: string;
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ScoreboardDebug({ deviceId }: { deviceId: string }) {
  const t = useTranslations("scoreboard.debug");
  const [snapshots, setSnapshots] = useState<ScoreboardSnapshotRow[]>([]);
  const [paused, setPaused] = useState(false);

  const { data: health } = useSWR<ScoreboardHealth>(
    deviceId ? `/admin/scoreboard/health?deviceId=${encodeURIComponent(deviceId)}` : null,
    () => api.scoreboard.health(deviceId),
    { refreshInterval: 2000 },
  );

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    void api.scoreboard
      .snapshots({ deviceId, limit: 200 })
      .then((rows) => {
        if (!cancelled) setSnapshots(rows);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    const es = new EventSource(
      `${apiBase}/public/scoreboard/stream?deviceId=${encodeURIComponent(deviceId)}`,
    );
    const onSnap = (ev: MessageEvent) => {
      if (paused) return;
      try {
        const event = JSON.parse(ev.data) as PublishEvent;
        // Only events that produced a real DB row belong in the history table.
        // Unchanged frames carry snapshotId=null and would render as blank rows.
        if (!event.changed || event.snapshotId === null) return;
        const row: ScoreboardSnapshotRow = {
          id: event.snapshotId,
          deviceId: event.deviceId,
          scoreHome: event.scoreHome,
          scoreGuest: event.scoreGuest,
          foulsHome: event.foulsHome,
          foulsGuest: event.foulsGuest,
          timeoutsHome: event.timeoutsHome,
          timeoutsGuest: event.timeoutsGuest,
          period: event.period,
          clockText: event.clockText,
          clockSeconds: event.clockSeconds,
          clockRunning: event.clockRunning,
          shotClock: event.shotClock,
          shotClockText: event.shotClockText,
          shotClockRunning: event.shotClockRunning,
          timeoutActive: event.timeoutActive,
          timeoutDuration: event.timeoutDuration,
          rawHex: null,
          capturedAt: event.lastFrameAt,
        };
        setSnapshots((curr) => {
          if (curr.some((s) => s.id === row.id)) return curr;
          return [row, ...curr].slice(0, 500);
        });
      } catch {
        // ignore
      }
    };
    es.addEventListener("snapshot", onSnap);
    return () => {
      es.removeEventListener("snapshot", onSnap);
      es.close();
    };
  }, [deviceId, paused]);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card flex items-center gap-3 rounded-md px-3 py-2 text-sm">
        <span
          className={`inline-block size-2 rounded-full ${health?.online ? "bg-primary" : "bg-destructive"}`}
        />
        <span>{deviceId || t("noDeviceId")}</span>
        <span className="text-muted-foreground">
          {t("lastFrame", {
            at: health?.lastFrameAt ?? "—",
            seconds: health?.secondsSinceLastFrame ?? "—",
          })}
        </span>
        <button
          type="button"
          className="bg-input border-border/20 ml-auto rounded-md border px-2 py-1"
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? t("resume") : t("pause")}
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface-low font-display text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2">{t("columns.id")}</th>
            <th className="px-2">{t("columns.at")}</th>
            <th className="px-2">{t("columns.home")}</th>
            <th className="px-2">{t("columns.guest")}</th>
            <th className="px-2">{t("columns.period")}</th>
            <th className="px-2">{t("columns.clock")}</th>
            <th className="px-2">{t("columns.shotClock")}</th>
            <th className="px-2" title={t("foulsTitle")}>{t("columns.fouls")}</th>
            <th className="px-2" title={t("timeoutsTitle")}>{t("columns.timeouts")}</th>
            <th className="px-2" title={t("flagsTitle")}>{t("columns.flags")}</th>
            <th className="px-2">{t("columns.hex")}</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.id} className="hover:bg-surface-high">
              <td className="px-2 tabular-nums">{s.id}</td>
              <td className="px-2 tabular-nums">{s.capturedAt}</td>
              <td className="px-2 tabular-nums">{s.scoreHome}</td>
              <td className="px-2 tabular-nums">{s.scoreGuest}</td>
              <td className="px-2 tabular-nums">{s.period}</td>
              <td className="px-2 tabular-nums">{s.clockText}</td>
              <td className="px-2 tabular-nums">
                {s.shotClockText || "—"}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({s.shotClock ?? "null"}
                  {s.shotClockRunning ? " ▶" : ""})
                </span>
              </td>
              <td className="px-2 tabular-nums">
                {s.foulsHome}/{s.foulsGuest}
              </td>
              <td className="px-2 tabular-nums">
                {s.timeoutsHome}/{s.timeoutsGuest}
              </td>
              <td className="px-2 text-xs">
                {s.clockRunning ? "▶" : "⏸"}
                {s.timeoutActive ? " TO" : ""}
              </td>
              <td className="px-2 font-mono text-xs text-muted-foreground">
                {s.rawHex ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
