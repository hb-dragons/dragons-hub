"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import {
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
  AlertCircle,
  ChevronDown,
  FilterX,
} from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import type {
  SyncRun,
  SyncRunEntry,
  SyncRunEntriesResponse,
  EntityType,
  EntryAction,
} from "./types";

interface SyncLogDetailProps {
  syncRun: SyncRun;
}

const ENTITY_CONFIG: Record<
  EntityType,
  { icon: React.ElementType; label: string; color: string }
> = {
  league: { icon: Trophy, label: "League", color: "text-yellow-600" },
  match: { icon: Gamepad2, label: "Match", color: "text-purple-600" },
  team: { icon: Users, label: "Team", color: "text-blue-600" },
  standing: { icon: BarChart, label: "Standing", color: "text-green-600" },
  venue: { icon: MapPin, label: "Venue", color: "text-orange-600" },
  referee: { icon: Shield, label: "Referee", color: "text-teal-600" },
  refereeRole: {
    icon: ClipboardList,
    label: "Referee Role",
    color: "text-indigo-600",
  },
};

const ACTION_CONFIG: Record<
  EntryAction,
  { icon: React.ElementType; label: string; variant: "success" | "default" | "secondary" | "destructive" }
> = {
  created: { icon: Plus, label: "Created", variant: "success" },
  updated: { icon: RefreshCw, label: "Updated", variant: "default" },
  skipped: { icon: SkipForward, label: "Skipped", variant: "secondary" },
  failed: { icon: XCircle, label: "Failed", variant: "destructive" },
};

export function SyncLogDetail({ syncRun }: SyncLogDetailProps) {
  const [entries, setEntries] = useState<SyncRunEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [showStack, setShowStack] = useState(false);

  const hasActiveFilters = entityFilter !== "all" || actionFilter !== "all";

  function clearFilters() {
    setEntityFilter("all");
    setActionFilter("all");
  }

  const loadEntries = useCallback(
    async (offset = 0, append = false, signal?: AbortSignal) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: "50",
          offset: String(offset),
        });
        if (entityFilter !== "all") params.set("entityType", entityFilter);
        if (actionFilter !== "all") params.set("action", actionFilter);

        const data = await fetchAPI<SyncRunEntriesResponse>(
          `/admin/sync/logs/${syncRun.id}/entries?${params}`,
          { signal },
        );

        setEntries((prev) => {
          if (!append) return data.items;
          const existingIds = new Set(prev.map((e) => e.id));
          return [...prev, ...data.items.filter((e) => !existingIds.has(e.id))];
        });
        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error("Failed to load sync entries");
      } finally {
        setLoading(false);
      }
    },
    [syncRun.id, entityFilter, actionFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadEntries(0, false, controller.signal);
    return () => controller.abort();
  }, [loadEntries]);

  return (
    <div className="space-y-4 p-4">
      {/* Error Details */}
      {syncRun.status === "failed" && syncRun.errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-400">
                {syncRun.errorMessage}
              </p>
              {syncRun.errorStack && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="mt-1 h-auto p-0 text-xs text-red-600"
                  onClick={() => setShowStack(!showStack)}
                >
                  <ChevronDown
                    className={`mr-1 h-3 w-3 transition-transform ${showStack ? "rotate-180" : ""}`}
                  />
                  {showStack ? "Hide" : "Show"} stack trace
                </Button>
              )}
              {showStack && syncRun.errorStack && (
                <pre className="mt-2 max-h-[200px] overflow-auto rounded bg-red-100 p-2 font-mono text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                  {syncRun.errorStack}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="league">Leagues</SelectItem>
            <SelectItem value="match">Matches</SelectItem>
            <SelectItem value="standing">Standings</SelectItem>
            <SelectItem value="team">Teams</SelectItem>
            <SelectItem value="venue">Venues</SelectItem>
            <SelectItem value="referee">Referees</SelectItem>
            <SelectItem value="refereeRole">Referee Roles</SelectItem>
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[140px] bg-background">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <FilterX className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}

        <span className="text-sm text-muted-foreground">
          {total} {total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Entries List */}
      <div className="max-h-[400px] overflow-y-auto rounded-md border">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading entries...
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <p>
              {hasActiveFilters
                ? "No entries match the selected filters"
                : "No entries found"}
            </p>
            {hasActiveFilters && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => {
              const entityCfg = ENTITY_CONFIG[entry.entityType] ?? {
                icon: ClipboardList,
                label: entry.entityType,
                color: "text-muted-foreground",
              };
              const actionCfg = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG.skipped;
              const EntityIcon = entityCfg.icon;
              const ActionIcon = actionCfg.icon;

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm bg-background"
                >
                  <EntityIcon className={`h-4 w-4 shrink-0 ${entityCfg.color}`} />
                  <span className="w-24 shrink-0 text-muted-foreground">
                    {entityCfg.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {entry.entityName || entry.entityId}
                  </span>
                  <Badge variant={actionCfg.variant} className="shrink-0">
                    <ActionIcon className="h-3 w-3" />
                    {actionCfg.label}
                  </Badge>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadEntries(entries.length, true)}
            disabled={loading}
          >
            Load more ({total - entries.length} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
