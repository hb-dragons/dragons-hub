"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import {
  Radio,
  Pause,
  Play,
  Trophy,
  Gamepad2,
  Users,
  BarChart,
  MapPin,
  Shield,
  ClipboardList,
  Plus,
  RefreshCw,
  SkipForward,
  XCircle,
} from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import type { LiveLogEntry, EntityType, EntryAction } from "./types";

interface SyncLiveLogsProps {
  syncRunId: number;
  onComplete: () => void;
}

const ENTITY_ICONS: Record<EntityType, React.ElementType> = {
  league: Trophy,
  match: Gamepad2,
  team: Users,
  standing: BarChart,
  venue: MapPin,
  referee: Shield,
  refereeRole: ClipboardList,
};

const ENTITY_COLORS: Record<EntityType, string> = {
  league: "text-yellow-600",
  match: "text-purple-600",
  team: "text-blue-600",
  standing: "text-green-600",
  venue: "text-orange-600",
  referee: "text-teal-600",
  refereeRole: "text-indigo-600",
};

const ACTION_ICONS: Record<EntryAction, React.ElementType> = {
  created: Plus,
  updated: RefreshCw,
  skipped: SkipForward,
  failed: XCircle,
};

const ACTION_COLORS: Record<EntryAction, string> = {
  created: "text-green-600",
  updated: "text-blue-600",
  skipped: "text-muted-foreground",
  failed: "text-red-600",
};

const MAX_ENTRIES = 500;

let entryCounter = 0;

export function SyncLiveLogs({ syncRunId, onComplete }: SyncLiveLogsProps) {
  const t = useTranslations();
  const [entries, setEntries] = useState<(LiveLogEntry & { _key: number })[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [counters, setCounters] = useState({
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = useCallback(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [paused]);

  useEffect(() => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const url = `${apiUrl}/admin/sync/logs/${syncRunId}/stream`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setConnected(true);
    });

    es.addEventListener("entry", (event) => {
      try {
        const data = JSON.parse(event.data) as LiveLogEntry;
        if (!data.timestamp) {
          data.timestamp = new Date().toISOString();
        }
        const keyedEntry = { ...data, _key: ++entryCounter };
        setEntries((prev) => {
          const next = [...prev, keyedEntry];
          return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
        });
        setCounters((prev) => ({
          ...prev,
          [data.action]: (prev[data.action as EntryAction] ?? 0) + 1,
        }));
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("complete", () => {
      es.close();
      setConnected(false);
      onComplete();
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [syncRunId, onComplete]);

  useEffect(() => {
    scrollToBottom();
  }, [entries, scrollToBottom]);

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 animate-pulse text-blue-500" />
            <CardTitle>{t("sync.live.title")}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? "success" : "secondary"}>
              {connected ? t("sync.live.connected") : t("sync.live.disconnected")}
            </Badge>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPaused(!paused)}
            >
              {paused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <CardDescription>
          {t("sync.live.streaming")}
        </CardDescription>
        {/* Live Counters */}
        <div className="flex gap-4 pt-2 text-sm">
          <span className="text-green-600">
            <Plus className="mr-1 inline h-3 w-3" />
            {t("sync.live.created", { count: counters.created })}
          </span>
          <span className="text-blue-600">
            <RefreshCw className="mr-1 inline h-3 w-3" />
            {t("sync.live.updated", { count: counters.updated })}
          </span>
          <span className="text-muted-foreground">
            <SkipForward className="mr-1 inline h-3 w-3" />
            {t("sync.live.skipped", { count: counters.skipped })}
          </span>
          <span className="text-red-600">
            <XCircle className="mr-1 inline h-3 w-3" />
            {t("sync.live.failed", { count: counters.failed })}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="min-h-[200px] max-h-[50vh] overflow-y-auto rounded-md bg-muted/30 font-mono text-sm"
        >
          {entries.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground">
              {t("sync.live.waiting")}
            </div>
          ) : (
            <div className="space-y-0.5 p-2">
              {entries.map((entry) => {
                const EntityIcon =
                  ENTITY_ICONS[entry.entityType] ?? ClipboardList;
                const entityColor =
                  ENTITY_COLORS[entry.entityType] ?? "text-muted-foreground";
                const ActionIcon = ACTION_ICONS[entry.action] ?? SkipForward;
                const actionColor =
                  ACTION_COLORS[entry.action] ?? "text-muted-foreground";

                return (
                  <div
                    key={entry._key}
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-0.5",
                      entry.action === "failed" && "bg-red-500/10",
                    )}
                  >
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <EntityIcon className={`h-3.5 w-3.5 shrink-0 ${entityColor}`} />
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">
                      {entry.entityType}
                    </span>
                    <ActionIcon className={`h-3.5 w-3.5 shrink-0 ${actionColor}`} />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {entry.entityName || entry.entityId}
                      {entry.message && (
                        <span className="ml-1 text-muted-foreground">
                          — {entry.message}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
