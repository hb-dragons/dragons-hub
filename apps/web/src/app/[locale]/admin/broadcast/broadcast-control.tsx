"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fetchAPI } from "@/lib/api";
import type { BroadcastConfig, BroadcastMatch } from "@dragons/shared";
import { MatchPicker } from "./match-picker";

interface Props {
  deviceId: string;
  initial: { config: BroadcastConfig | null; match: BroadcastMatch | null };
}

export function BroadcastControl({ deviceId, initial }: Props) {
  const t = useTranslations("broadcast");
  const [config, setConfig] = useState<BroadcastConfig | null>(initial.config);
  const [match, setMatch] = useState<BroadcastMatch | null>(initial.match);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLive = config?.isLive ?? false;
  const overlayUrl =
    typeof window !== "undefined" ? `${window.location.origin}/overlay` : "";

  async function reload() {
    const next = await fetchAPI<{
      config: BroadcastConfig | null;
      match: BroadcastMatch | null;
    }>(`/admin/broadcast/config?deviceId=${encodeURIComponent(deviceId)}`);
    setConfig(next.config);
    setMatch(next.match);
  }

  async function save(partial: Partial<BroadcastConfig>) {
    setError(null);
    await fetchAPI(`/admin/broadcast/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, ...partial }),
    });
    await reload();
  }

  async function goLive() {
    setError(null);
    try {
      await fetchAPI(`/admin/broadcast/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      await reload();
    } catch {
      setError(t("errors.matchRequired"));
    }
  }

  async function endBroadcast() {
    await fetchAPI(`/admin/broadcast/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    await reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block size-2 rounded-full ${
              isLive ? "bg-emerald-500" : "bg-zinc-500"
            }`}
          />
          <span>{isLive ? t("live") : t("idle")}</span>
        </div>
      </div>

      <section className="rounded border border-zinc-800 p-4">
        <div className="mb-2 text-sm uppercase text-zinc-400">
          {t("selectedMatch")}
        </div>
        {match ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-medium">
                {match.home.name} vs {match.guest.name}
              </div>
              <div className="text-sm text-zinc-400">
                {match.kickoffDate} — {match.kickoffTime.slice(0, 5)} —{" "}
                {match.league?.name ?? ""}
              </div>
            </div>
            <button
              type="button"
              className="rounded border border-zinc-700 px-3 py-1"
              onClick={() => setPickerOpen(true)}
            >
              {t("changeMatch")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="rounded border border-zinc-700 px-3 py-1"
            onClick={() => setPickerOpen(true)}
          >
            {t("changeMatch")}
          </button>
        )}
      </section>

      <section className="rounded border border-zinc-800 p-4">
        <div className="mb-2 text-sm uppercase text-zinc-400">{t("config")}</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col">
            <span className="text-xs text-zinc-400">{t("homeAbbr")}</span>
            <input
              type="text"
              defaultValue={config?.homeAbbr ?? ""}
              maxLength={8}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              onBlur={(e) =>
                save({ homeAbbr: e.target.value || null })
              }
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-400">{t("guestAbbr")}</span>
            <input
              type="text"
              defaultValue={config?.guestAbbr ?? ""}
              maxLength={8}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              onBlur={(e) =>
                save({ guestAbbr: e.target.value || null })
              }
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-400">{t("homeColor")}</span>
            <input
              type="text"
              placeholder={t("useDefault")}
              defaultValue={config?.homeColorOverride ?? ""}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              onBlur={(e) =>
                save({ homeColorOverride: e.target.value || null })
              }
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-400">{t("guestColor")}</span>
            <input
              type="text"
              placeholder={t("useDefault")}
              defaultValue={config?.guestColorOverride ?? ""}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              onBlur={(e) =>
                save({ guestColorOverride: e.target.value || null })
              }
            />
          </label>
        </div>
      </section>

      {deviceId && (
        <section className="rounded border border-zinc-800 p-4">
          <div className="mb-2 text-sm uppercase text-zinc-400">Preview</div>
          <div
            className="overflow-hidden rounded border border-dashed border-zinc-700"
            style={{ aspectRatio: "16 / 9", background: "#222" }}
          >
            <iframe
              src="/overlay"
              title="overlay-preview"
              className="size-full"
            />
          </div>
        </section>
      )}

      <div className="flex items-center gap-3">
        {!isLive ? (
          <button
            type="button"
            disabled={!match}
            onClick={goLive}
            className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            ▶ {t("goLive")}
          </button>
        ) : (
          <button
            type="button"
            onClick={endBroadcast}
            className="rounded bg-rose-600 px-4 py-2 font-semibold text-white"
          >
            ■ {t("endBroadcast")}
          </button>
        )}
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>

      <div className="text-sm text-zinc-400">
        {t("obsUrl")}: <code className="text-zinc-200">{overlayUrl}</code>
        <button
          type="button"
          className="ml-2 rounded border border-zinc-700 px-2 py-0.5"
          onClick={() => navigator.clipboard.writeText(overlayUrl)}
        >
          {t("copy")}
        </button>
      </div>

      {pickerOpen && (
        <MatchPicker
          onClose={() => setPickerOpen(false)}
          onPick={async (matchId) => {
            await save({ matchId });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
