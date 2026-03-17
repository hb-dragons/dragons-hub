"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations, useFormatter } from "next-intl";
import useSWR from "swr";
import { toast } from "sonner";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@dragons/ui/components/dialog";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import { Textarea } from "@dragons/ui/components/textarea";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  DomainEventItem,
  DomainEventListResult,
  TriggerEventBody,
} from "./types";

// ---------------------------------------------------------------------------
// Badge variant helpers
// ---------------------------------------------------------------------------

function typeBadgeVariant(
  type: string,
): "default" | "secondary" | "outline" | "destructive" {
  if (type.startsWith("referee.")) return "outline";
  if (type.startsWith("booking.")) return "secondary";
  if (type.startsWith("override.")) return "destructive";
  return "default";
}

function sourceBadgeVariant(
  source: DomainEventItem["source"],
): "default" | "secondary" | "outline" {
  if (source === "sync") return "secondary";
  if (source === "reconciliation") return "outline";
  return "default";
}

function urgencyBadgeVariant(
  urgency: DomainEventItem["urgency"],
): "secondary" | "destructive" {
  return urgency === "immediate" ? "destructive" : "secondary";
}

type TranslateFunc = ReturnType<typeof import("next-intl").useTranslations>;

function sourceLabel(source: string, t: TranslateFunc): string {
  switch (source) {
    case "sync": return t("sourceLabels.sync" as never);
    case "manual": return t("sourceLabels.manual" as never);
    case "reconciliation": return t("sourceLabels.reconciliation" as never);
    default: return source;
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

interface Filters {
  type: string;
  entityType: string;
  source: string;
  from: string;
  to: string;
  search: string;
}

const EMPTY_FILTERS: Filters = {
  type: "",
  entityType: "",
  source: "",
  from: "",
  to: "",
  search: "",
};

const PAGE_SIZES = [25, 50, 100];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventBrowser() {
  const t = useTranslations("domainEvents");
  const format = useFormatter();

  // Filters & pagination
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (filters.type) params.set("type", filters.type);
    if (filters.entityType) params.set("entityType", filters.entityType);
    if (filters.source) params.set("source", filters.source);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.search) params.set("search", filters.search);
    return params.toString();
  }, [filters, page, pageSize]);

  const swrKey = SWR_KEYS.domainEvents(queryParams);
  const { data, isLoading, mutate } = useSWR<DomainEventListResult>(
    swrKey,
    apiFetcher,
  );

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const updateFilter = useCallback(
    (key: keyof Filters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Trigger dialog state
  // ---------------------------------------------------------------------------

  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggerForm, setTriggerForm] = useState<TriggerEventBody>({
    type: "",
    entityType: "match",
    entityId: 0,
    entityName: "",
    deepLinkPath: "",
  });
  const [triggerPayload, setTriggerPayload] = useState("");
  const [triggerUrgency, setTriggerUrgency] = useState<string>("");
  const [triggerSubmitting, setTriggerSubmitting] = useState(false);

  async function handleTrigger() {
    setTriggerSubmitting(true);
    try {
      const body: TriggerEventBody = {
        ...triggerForm,
        ...(triggerPayload ? { payload: JSON.parse(triggerPayload) } : {}),
        ...(triggerUrgency
          ? { urgencyOverride: triggerUrgency as "immediate" | "routine" }
          : {}),
      };
      await fetchAPI("/admin/events/trigger", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(t("triggerSuccess"));
      setTriggerOpen(false);
      setTriggerForm({
        type: "",
        entityType: "match",
        entityId: 0,
        entityName: "",
        deepLinkPath: "",
      });
      setTriggerPayload("");
      setTriggerUrgency("");
      mutate();
    } catch {
      toast.error(t("triggerFailed"));
    } finally {
      setTriggerSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-medium">
          {total > 0
            ? `${total} event${total === 1 ? "" : "s"}`
            : t("empty")}
        </CardTitle>

        <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t("trigger")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("trigger")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="trigger-type">{t("columns.type")}</Label>
                <Input
                  id="trigger-type"
                  value={triggerForm.type}
                  onChange={(e) =>
                    setTriggerForm((f) => ({ ...f, type: e.target.value }))
                  }
                  placeholder="match.time_changed"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>{t("columns.entity")} Type</Label>
                  <Select
                    value={triggerForm.entityType}
                    onValueChange={(v) =>
                      setTriggerForm((f) => ({
                        ...f,
                        entityType: v as "match" | "booking" | "referee",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="match">match</SelectItem>
                      <SelectItem value="booking">booking</SelectItem>
                      <SelectItem value="referee">referee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>{t("columns.entity")} ID</Label>
                  <Input
                    type="number"
                    value={triggerForm.entityId || ""}
                    onChange={(e) =>
                      setTriggerForm((f) => ({
                        ...f,
                        entityId: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>{t("columns.entity")} Name</Label>
                <Input
                  value={triggerForm.entityName}
                  onChange={(e) =>
                    setTriggerForm((f) => ({
                      ...f,
                      entityName: e.target.value,
                    }))
                  }
                  placeholder="Dragons vs. Tigers"
                />
              </div>
              <div className="grid gap-2">
                <Label>Deep Link Path</Label>
                <Input
                  value={triggerForm.deepLinkPath}
                  onChange={(e) =>
                    setTriggerForm((f) => ({
                      ...f,
                      deepLinkPath: e.target.value,
                    }))
                  }
                  placeholder="/admin/matches/123"
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("columns.urgency")}</Label>
                <Select value={triggerUrgency} onValueChange={setTriggerUrgency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">immediate</SelectItem>
                    <SelectItem value="routine">routine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Payload (JSON)</Label>
                <Textarea
                  value={triggerPayload}
                  onChange={(e) => setTriggerPayload(e.target.value)}
                  placeholder='{"field": "value"}'
                  className="font-mono text-sm"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleTrigger}
                disabled={
                  triggerSubmitting ||
                  !triggerForm.type ||
                  !triggerForm.entityName ||
                  !triggerForm.deepLinkPath ||
                  !triggerForm.entityId
                }
              >
                {t("trigger")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("columns.type")}
            </Label>
            <Input
              className="h-8 w-44"
              placeholder="match.*"
              value={filters.type}
              onChange={(e) => updateFilter("type", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("columns.entity")}
            </Label>
            <Select
              value={filters.entityType}
              onValueChange={(v) => updateFilter("entityType", v)}
            >
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="match">match</SelectItem>
                <SelectItem value="booking">booking</SelectItem>
                <SelectItem value="referee">referee</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("columns.source")}
            </Label>
            <Select
              value={filters.source}
              onValueChange={(v) => updateFilter("source", v)}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="sync">{t("sourceLabels.sync")}</SelectItem>
                <SelectItem value="manual">
                  {t("sourceLabels.manual")}
                </SelectItem>
                <SelectItem value="reconciliation">
                  {t("sourceLabels.reconciliation")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              className="h-8 w-36"
              value={filters.from}
              onChange={(e) => updateFilter("from", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              className="h-8 w-36"
              value={filters.to}
              onChange={(e) => updateFilter("to", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <Input
              className="h-8 w-48"
              placeholder="Search..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.entity")}</TableHead>
                <TableHead>{t("columns.source")}</TableHead>
                <TableHead>{t("columns.urgency")}</TableHead>
                <TableHead>{t("columns.date")}</TableHead>
                <TableHead>{t("columns.actor")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <span className="text-muted-foreground">Loading...</span>
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <span className="text-muted-foreground">{t("empty")}</span>
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event) => {
                  const isExpanded = expandedId === event.id;
                  return (
                    <EventRow
                      key={event.id}
                      event={event}
                      isExpanded={isExpanded}
                      onToggle={() =>
                        setExpandedId(isExpanded ? null : event.id)
                      }
                      format={format}
                      t={t}
                    />
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(1)}
                disabled={page <= 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row sub-component (keeps the main component cleaner)
// ---------------------------------------------------------------------------

interface EventRowProps {
  event: DomainEventItem;
  isExpanded: boolean;
  onToggle: () => void;
  format: ReturnType<typeof useFormatter>;
  t: ReturnType<typeof useTranslations<"domainEvents">>;
}

function EventRow({ event, isExpanded, onToggle, format, t }: EventRowProps) {
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <TableCell className="w-8 px-2">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          <Badge variant={typeBadgeVariant(event.type)} className="text-xs">
            {event.type}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="truncate max-w-[200px]">{event.entityName}</span>
            <Badge variant="outline" className="text-xs">
              {event.entityType}
            </Badge>
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant={sourceBadgeVariant(event.source)}
            className="text-xs"
          >
            {sourceLabel(event.source, t)}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge
            variant={urgencyBadgeVariant(event.urgency)}
            className="text-xs"
          >
            {event.urgency}
          </Badge>
        </TableCell>
        <TableCell className="tabular-nums whitespace-nowrap">
          {format.dateTime(new Date(event.occurredAt), {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {event.actor ?? "\u2014"}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                ID: <code className="font-mono">{event.id}</code>
              </span>
              {event.syncRunId != null && (
                <span>Sync Run: {event.syncRunId}</span>
              )}
              <span>
                Deep Link:{" "}
                <code className="font-mono">{event.deepLinkPath}</code>
              </span>
              {event.enqueuedAt && (
                <span>
                  Enqueued:{" "}
                  {format.dateTime(new Date(event.enqueuedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
