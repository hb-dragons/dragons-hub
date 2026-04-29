"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import type {
  ScoreboardSnapshotRow,
  StramatelSnapshot,
} from "@dragons/shared";
import { fetchAPI } from "@/lib/api";

interface PublishEvent extends StramatelSnapshot {
  deviceId: string;
  snapshotId: number | null;
  changed: boolean;
  lastFrameAt: string;
}

interface Health {
  deviceId: string;
  lastFrameAt: string | null;
  secondsSinceLastFrame: number | null;
  online: boolean;
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ScoreboardDebug({ deviceId }: { deviceId: string }) {
  const [snapshots, setSnapshots] = useState<ScoreboardSnapshotRow[]>([]);
  const [paused, setPaused] = useState(false);

  const { data: health } = useSWR<Health>(
    deviceId ? `/admin/scoreboard/health?deviceId=${encodeURIComponent(deviceId)}` : null,
    (url: string) => fetchAPI<Health>(url),
    { refreshInterval: 2000 },
  );

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    fetchAPI<ScoreboardSnapshotRow[]>(
      `/admin/scoreboard/snapshots?deviceId=${encodeURIComponent(deviceId)}&limit=200`,
    ).then((rows) => {
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
      <div className="flex items-center gap-3 rounded border border-zinc-800 px-3 py-2 text-sm">
        <span
          className={`inline-block size-2 rounded-full ${health?.online ? "bg-emerald-500" : "bg-rose-500"}`}
        />
        <span>{deviceId || "(no device id configured)"}</span>
        <span className="text-zinc-400">
          Last frame: {health?.lastFrameAt ?? "—"} (
          {health?.secondsSinceLastFrame ?? "—"}s ago)
        </span>
        <button
          type="button"
          className="ml-auto rounded border border-zinc-700 px-2 py-1"
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr>
            <th className="px-2">id</th>
            <th className="px-2">at</th>
            <th className="px-2">H</th>
            <th className="px-2">G</th>
            <th className="px-2">Q</th>
            <th className="px-2">clock</th>
            <th className="px-2">SC</th>
            <th className="px-2">hex</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.id} className="border-t border-zinc-900">
              <td className="px-2 tabular-nums">{s.id}</td>
              <td className="px-2 tabular-nums">{s.capturedAt}</td>
              <td className="px-2 tabular-nums">{s.scoreHome}</td>
              <td className="px-2 tabular-nums">{s.scoreGuest}</td>
              <td className="px-2 tabular-nums">{s.period}</td>
              <td className="px-2 tabular-nums">{s.clockText}</td>
              <td className="px-2 tabular-nums">{s.shotClock}</td>
              <td className="px-2 font-mono text-xs text-zinc-500">
                {s.rawHex ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
