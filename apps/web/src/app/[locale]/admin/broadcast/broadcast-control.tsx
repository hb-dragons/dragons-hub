"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Pencil, Play, Radio, Square } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Field, FieldLabel } from "@dragons/ui/components/field";
import { Badge } from "@dragons/ui/components/badge";
import { PageHeader } from "@/components/admin/shared/page-header";
import type { BroadcastConfig, BroadcastMatch } from "@dragons/shared";
import { MatchPicker } from "./match-picker";

interface Props {
  deviceId: string;
  initial: { config: BroadcastConfig | null; match: BroadcastMatch | null };
}

const subscribeNoop = () => () => {};

export function BroadcastControl({ deviceId, initial }: Props) {
  const t = useTranslations("broadcast");
  const [config, setConfig] = useState<BroadcastConfig | null>(initial.config);
  const [match, setMatch] = useState<BroadcastMatch | null>(initial.match);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isLive = config?.isLive ?? false;
  const overlayUrl = useSyncExternalStore(
    subscribeNoop,
    () => `${window.location.origin}/overlay`,
    () => "",
  );

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

  async function copyOverlayUrl() {
    await navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={deviceId ? `${t("device")}: ${deviceId}` : undefined}
      >
        <Badge
          variant={isLive ? "default" : "outline"}
          className={isLive ? "bg-heat text-heat-foreground" : ""}
        >
          <Radio className={isLive ? "animate-pulse" : ""} />
          {isLive ? t("live") : t("idle")}
        </Badge>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("selectedMatch")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {match ? (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <p className="font-display text-lg font-bold leading-tight">
                    {match.home.name}
                    <span className="px-2 text-muted-foreground">vs</span>
                    {match.guest.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {match.kickoffDate} · {match.kickoffTime.slice(0, 5)}
                    {match.league?.name ? ` · ${match.league.name}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <Pencil />
                  {t("changeMatch")}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">{t("noMatch")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  {t("changeMatch")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("config")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>{t("homeAbbr")}</FieldLabel>
                <Input
                  defaultValue={config?.homeAbbr ?? ""}
                  maxLength={8}
                  onBlur={(e) => save({ homeAbbr: e.target.value || null })}
                />
              </Field>
              <Field>
                <FieldLabel>{t("guestAbbr")}</FieldLabel>
                <Input
                  defaultValue={config?.guestAbbr ?? ""}
                  maxLength={8}
                  onBlur={(e) => save({ guestAbbr: e.target.value || null })}
                />
              </Field>
              <Field>
                <FieldLabel>{t("homeColor")}</FieldLabel>
                <Input
                  placeholder={t("useDefault")}
                  defaultValue={config?.homeColorOverride ?? ""}
                  onBlur={(e) =>
                    save({ homeColorOverride: e.target.value || null })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t("guestColor")}</FieldLabel>
                <Input
                  placeholder={t("useDefault")}
                  defaultValue={config?.guestColorOverride ?? ""}
                  onBlur={(e) =>
                    save({ guestColorOverride: e.target.value || null })
                  }
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      {deviceId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preview
            </CardTitle>
            <Badge variant="outline" className="font-mono">
              16:9
            </Badge>
          </CardHeader>
          <CardContent>
            <div
              className="overflow-hidden rounded-md bg-surface-low"
              style={{ aspectRatio: "16 / 9" }}
            >
              <iframe
                src="/overlay"
                title="overlay-preview"
                className="size-full"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          {!isLive ? (
            <Button disabled={!match} onClick={goLive} size="lg">
              <Play />
              {t("goLive")}
            </Button>
          ) : (
            <Button variant="destructive" onClick={endBroadcast} size="lg">
              <Square />
              {t("endBroadcast")}
            </Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="ml-auto flex min-w-0 max-w-full items-center gap-2">
            <span className="shrink-0 font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("obsUrl")}
            </span>
            <code className="bg-surface-low truncate rounded-md px-2 py-1 font-mono text-xs">
              {overlayUrl}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={copyOverlayUrl}
              aria-label={t("copy")}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <MatchPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={async (matchId) => {
          await save({ matchId });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
