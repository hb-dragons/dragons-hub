"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchAPI } from "@/lib/api";
import type { AdminBroadcastMatchListItem } from "@dragons/shared";

interface Props {
  onClose: () => void;
  onPick: (matchId: number) => Promise<void> | void;
}

export function MatchPicker({ onClose, onPick }: Props) {
  const t = useTranslations("broadcast");
  const [tab, setTab] = useState<"today" | "search">("today");
  const [q, setQ] = useState("");
  const [list, setList] = useState<AdminBroadcastMatchListItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ scope: tab });
    if (tab === "search" && q) params.set("q", q);
    fetchAPI<{ matches: AdminBroadcastMatchListItem[] }>(
      `/admin/broadcast/matches?${params.toString()}`,
    ).then((res) => {
      if (!cancelled) setList(res.matches);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-xl rounded border border-zinc-700 bg-zinc-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("pickerTitle")}</h2>
          <button onClick={onClose} className="px-2">
            ✕
          </button>
        </div>
        <div className="mb-2 flex gap-2">
          <button
            className={`rounded px-3 py-1 ${
              tab === "today" ? "bg-zinc-700" : "border border-zinc-700"
            }`}
            onClick={() => setTab("today")}
          >
            {t("today")}
          </button>
          <button
            className={`rounded px-3 py-1 ${
              tab === "search" ? "bg-zinc-700" : "border border-zinc-700"
            }`}
            onClick={() => setTab("search")}
          >
            {t("search")}
          </button>
          {tab === "search" && (
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2"
              placeholder={t("search")}
            />
          )}
        </div>
        <ul className="max-h-80 overflow-auto">
          {list.length === 0 && tab === "today" && (
            <li className="py-4 text-center text-zinc-400">
              {t("noMatchesToday")}
            </li>
          )}
          {list.map((m) => (
            <li
              key={m.id}
              className="flex cursor-pointer items-center justify-between rounded px-2 py-2 hover:bg-zinc-800"
              onClick={() => onPick(m.id)}
            >
              <div>
                {m.homeName} vs {m.guestName}
              </div>
              <div className="text-sm text-zinc-400">
                {m.kickoffDate} {m.kickoffTime.slice(0, 5)}
                {m.leagueName ? ` — ${m.leagueName}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
