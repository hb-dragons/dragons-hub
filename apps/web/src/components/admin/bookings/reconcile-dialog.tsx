"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@dragons/ui/components/dialog";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import { Separator } from "@dragons/ui/components/separator";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { cn } from "@dragons/ui/lib/utils";
import {
  ArrowRight,
  CirclePlus,
  Loader2,
  RefreshCw,
  Pencil,
  Trash2,
} from "lucide-react";
import { getTeamColor } from "../matches/utils";
import type {
  ReconcilePreview,
  ReconcilePreviewMatch,
  ReconcilePreviewCreate,
  ReconcilePreviewUpdate,
  ReconcilePreviewRemove,
} from "@dragons/shared";

function timeToDate(time: string): Date {
  return new Date(`1970-01-01T${time}`);
}

function MatchBadge({ match }: { match: ReconcilePreviewMatch }) {
  const t = useTranslations("bookings.reconcile");
  const format = useFormatter();
  const teamName = match.homeTeamCustomName ?? match.homeTeam;
  const color = getTeamColor(teamName);
  const inactive = match.isForfeited || match.isCancelled;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        inactive && "opacity-60",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
          color.bg,
          color.border,
          color.text,
        )}
      >
        {teamName}
      </span>
      <span>vs {match.guestTeam}</span>
      <span className="tabular-nums text-muted-foreground">
        {format.dateTime(timeToDate(match.kickoffTime), "matchTime")}
      </span>
      {match.isForfeited && (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          {t("forfeited")}
        </Badge>
      )}
      {match.isCancelled && (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          {t("cancelled")}
        </Badge>
      )}
    </div>
  );
}

function CreateSection({ items }: { items: ReconcilePreviewCreate[] }) {
  const t = useTranslations("bookings.reconcile");
  const format = useFormatter();

  if (items.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
        <CirclePlus className="h-4 w-4" />
        {t("toCreate")} ({items.length})
      </div>
      {items.map((item, i) => (
        <div key={i} className="rounded-md border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-950/30">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{item.venueName}</span>
            <span className="tabular-nums text-muted-foreground">
              {format.dateTime(new Date(item.date + "T00:00:00"), "matchDate")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("timeWindow")}: {format.dateTime(timeToDate(item.calculatedStartTime), "matchTime")} – {format.dateTime(timeToDate(item.calculatedEndTime), "matchTime")}
          </p>
          <div className="mt-2 space-y-1">
            {item.matches.map((m) => (
              <MatchBadge key={m.id} match={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UpdateSection({ items }: { items: ReconcilePreviewUpdate[] }) {
  const t = useTranslations("bookings.reconcile");
  const format = useFormatter();

  if (items.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
        <Pencil className="h-4 w-4" />
        {t("toUpdate")} ({items.length})
      </div>
      {items.map((item) => (
        <div key={item.bookingId} className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{item.venueName}</span>
            <span className="tabular-nums text-muted-foreground">
              {format.dateTime(new Date(item.date + "T00:00:00"), "matchDate")}
            </span>
          </div>
          {(item.currentStartTime !== item.newStartTime ||
            item.currentEndTime !== item.newEndTime) && (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {format.dateTime(timeToDate(item.currentStartTime), "matchTime")} – {format.dateTime(timeToDate(item.currentEndTime), "matchTime")}
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="tabular-nums font-medium text-foreground">
                {format.dateTime(timeToDate(item.newStartTime), "matchTime")} – {format.dateTime(timeToDate(item.newEndTime), "matchTime")}
              </span>
            </div>
          )}
          {item.matchesAdded.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-green-700 dark:text-green-400">
                + {t("matchesAdded")}
              </p>
              <div className="mt-1 space-y-1">
                {item.matchesAdded.map((m) => (
                  <MatchBadge key={m.id} match={m} />
                ))}
              </div>
            </div>
          )}
          {item.matchesRemoved.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-red-700 dark:text-red-400">
                − {t("matchesRemoved")}
              </p>
              <div className="mt-1 space-y-1">
                {item.matchesRemoved.map((m) => (
                  <MatchBadge key={m.id} match={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RemoveSection({ items }: { items: ReconcilePreviewRemove[] }) {
  const t = useTranslations("bookings.reconcile");
  const format = useFormatter();

  if (items.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
        <Trash2 className="h-4 w-4" />
        {t("toRemove")} ({items.length})
      </div>
      {items.map((item) => (
        <div key={item.bookingId} className="rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{item.venueName}</span>
            <span className="tabular-nums text-muted-foreground">
              {format.dateTime(new Date(item.date + "T00:00:00"), "matchDate")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.reason === "all_matches_cancelled"
              ? t("reasonCancelled")
              : t("reasonNoMatches")}
          </p>
          {item.matches.length > 0 && (
            <div className="mt-2 space-y-1">
              {item.matches.map((m) => (
                <MatchBadge key={m.id} match={m} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface ReconcileDialogProps {
  onReconciled: () => void;
}

export function ReconcileDialog({ onReconciled }: ReconcileDialogProps) {
  const t = useTranslations("bookings");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ReconcilePreview | null>(null);

  async function loadPreview() {
    setLoading(true);
    setPreview(null);
    try {
      const result = await fetchAPI<ReconcilePreview>(
        "/admin/bookings/reconcile/preview",
      );
      setPreview(result);
    } catch {
      toast.error(t("toast.updated")); // generic error
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      await fetchAPI("/admin/bookings/reconcile", { method: "POST" });
      toast.success(t("toast.reconciled"));
      onReconciled();
      setOpen(false);
    } catch {
      toast.error(t("toast.updated"));
    } finally {
      setApplying(false);
    }
  }

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen);
    if (newOpen) {
      loadPreview();
    }
  }

  const hasChanges =
    preview &&
    (preview.toCreate.length > 0 ||
      preview.toUpdate.length > 0 ||
      preview.toRemove.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("reconcile.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("reconcile.title")}</DialogTitle>
          <DialogDescription>{t("reconcile.description")}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {preview && !hasChanges && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("reconcile.noChanges")}
          </p>
        )}

        {preview && hasChanges && (
          <div className="space-y-4 py-2">
            <CreateSection items={preview.toCreate} />
            {preview.toCreate.length > 0 && preview.toUpdate.length > 0 && (
              <Separator />
            )}
            <UpdateSection items={preview.toUpdate} />
            {(preview.toCreate.length > 0 || preview.toUpdate.length > 0) &&
              preview.toRemove.length > 0 && <Separator />}
            <RemoveSection items={preview.toRemove} />
          </div>
        )}

        {preview && hasChanges && (
          <DialogFooter>
            <Button onClick={handleApply} disabled={applying}>
              {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("reconcile.apply")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
