"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { fetchAPI } from "@/lib/api";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@dragons/ui/components/sheet";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { TimePicker } from "@dragons/ui/components/time-picker";
import { Textarea } from "@dragons/ui/components/textarea";
import { Field, FieldLabel } from "@dragons/ui/components/field";
import { Separator } from "@dragons/ui/components/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dragons/ui/components/alert-dialog";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { AlertTriangle, Loader2, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@dragons/ui/lib/utils";
import { getTeamColor } from "../matches/utils";
import type { BookingDetail } from "./types";

const STATUSES = ["pending", "requested", "confirmed", "cancelled"] as const;

const statusVariantMap = {
  pending: "secondary",
  requested: "default",
  confirmed: "success",
  cancelled: "destructive",
} as const;

function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-4">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20" />
          ))}
        </div>
      </div>
      <Separator />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

interface BookingDetailSheetProps {
  bookingId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function BookingDetailSheet({
  bookingId,
  open,
  onOpenChange,
  onUpdated,
}: BookingDetailSheetProps) {
  const t = useTranslations();
  const format = useFormatter();
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [status, setStatus] = useState<string>("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch booking detail when the sheet opens
  useEffect(() => {
    if (!open || bookingId == null) return;

    let cancelled = false;
    setLoading(true);

    fetchAPI<BookingDetail>(`/admin/bookings/${bookingId}`)
      .then((result) => {
        if (cancelled) return;
        setBooking(result);
        setStatus(result.status);
        setStartTime(result.overrideStartTime ?? result.calculatedStartTime ?? "");
        setEndTime(result.overrideEndTime ?? result.calculatedEndTime ?? "");
        setOverrideReason(result.overrideReason ?? "");
        setNotes(result.notes ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(t("common.failed"));
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty =
    !!booking &&
    (status !== booking.status ||
      startTime !== (booking.overrideStartTime ?? booking.calculatedStartTime ?? "") ||
      endTime !== (booking.overrideEndTime ?? booking.calculatedEndTime ?? "") ||
      overrideReason !== (booking.overrideReason ?? "") ||
      notes !== (booking.notes ?? ""));

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      onOpenChange(false);
    }
  }, [isDirty, onOpenChange]);

  const handleDiscard = useCallback(() => {
    setShowDiscardDialog(false);
    onOpenChange(false);
  }, [onOpenChange]);

  async function handleSave() {
    if (bookingId == null || !booking) return;
    setSaving(true);
    try {
      // Update status if changed
      if (status !== booking.status) {
        await fetchAPI(
          `/admin/bookings/${bookingId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
        );
      }

      // Send override times only when they differ from calculated
      const calcStart = booking.calculatedStartTime ?? "";
      const calcEnd = booking.calculatedEndTime ?? "";
      const overrideStart = startTime && startTime !== calcStart ? startTime : null;
      const overrideEnd = endTime && endTime !== calcEnd ? endTime : null;

      await fetchAPI(
        `/admin/bookings/${bookingId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            overrideStartTime: overrideStart,
            overrideEndTime: overrideEnd,
            overrideReason: overrideReason || null,
            notes: notes || null,
          }),
        },
      );

      // Re-fetch full detail to get complete BookingDetail shape
      const result = await fetchAPI<BookingDetail>(
        `/admin/bookings/${bookingId}`,
      );
      setBooking(result);
      setStatus(result.status);
      setStartTime(result.overrideStartTime ?? result.calculatedStartTime ?? "");
      setEndTime(result.overrideEndTime ?? result.calculatedEndTime ?? "");
      setOverrideReason(result.overrideReason ?? "");
      setNotes(result.notes ?? "");
      onUpdated();
      toast.success(t("bookings.toast.updated"));
    } catch {
      toast.error(t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (bookingId == null) return;
    setDeleting(true);
    try {
      await fetchAPI(`/admin/bookings/${bookingId}`, { method: "DELETE" });
      onUpdated();
      onOpenChange(false);
      toast.success(t("bookings.toast.deleted"));
    } catch {
      toast.error(t("common.failed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <SheetContent
        className="sm:max-w-lg"
        showCloseButton={false}
        onInteractOutside={(e) => {
          if (isDirty) {
            e.preventDefault();
            setShowDiscardDialog(true);
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isDirty) {
            e.preventDefault();
            setShowDiscardDialog(true);
          }
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-3 right-3"
          onClick={handleClose}
        >
          <X />
          <span className="sr-only">Close</span>
        </Button>

        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {loading || !booking ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              <>
                {booking.venueName}
                <Badge variant={statusVariantMap[booking.status]}>
                  {t(`bookings.status.${booking.status}`)}
                </Badge>
                {booking.needsReconfirmation && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                )}
              </>
            )}
          </SheetTitle>
          {loading || !booking ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <SheetDescription>
              {format.dateTime(
                new Date(booking.date + "T00:00:00"),
                "matchDate",
              )}
            </SheetDescription>
          )}
        </SheetHeader>

        {loading || !booking ? (
          <SheetSkeleton />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
              {/* Status controls */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("bookings.columns.status")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <Button
                      key={s}
                      variant={status === s ? "default" : "outline"}
                      size="sm"
                      onClick={() => setStatus(s)}
                      disabled={status === s}
                    >
                      {t(`bookings.status.${s}`)}
                    </Button>
                  ))}
                </div>

              {booking.needsReconfirmation && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t("bookings.needsReconfirmation")}
                  </div>
                </div>
              )}
              </section>

              <Separator />

              {/* Time section */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("bookings.detail.times")}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel>{t("bookings.detail.startTime")}</FieldLabel>
                    <TimePicker
                      value={startTime.slice(0, 5) || null}
                      onChange={(v) => setStartTime(v ? v + ":00" : "")}
                      className="h-9 w-full"
                    />
                    {booking.calculatedStartTime && startTime !== booking.calculatedStartTime && (
                      <p className="text-xs text-muted-foreground">
                        {t("bookings.detail.calculated")}: {format.dateTime(new Date(`1970-01-01T${booking.calculatedStartTime}`), "matchTime")}
                      </p>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>{t("bookings.detail.endTime")}</FieldLabel>
                    <TimePicker
                      value={endTime.slice(0, 5) || null}
                      onChange={(v) => setEndTime(v ? v + ":00" : "")}
                      className="h-9 w-full"
                    />
                    {booking.calculatedEndTime && endTime !== booking.calculatedEndTime && (
                      <p className="text-xs text-muted-foreground">
                        {t("bookings.detail.calculated")}: {format.dateTime(new Date(`1970-01-01T${booking.calculatedEndTime}`), "matchTime")}
                      </p>
                    )}
                  </Field>
                </div>
                {booking.calculatedStartTime && (startTime !== booking.calculatedStartTime || endTime !== booking.calculatedEndTime) && (
                  <Field>
                    <FieldLabel>{t("bookings.override.reason")}</FieldLabel>
                    <Input
                      id="override-reason"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder={t("bookings.detail.reasonPlaceholder")}
                    />
                  </Field>
                )}
              </section>

              <Separator />

              {/* Linked matches */}
              {booking.matches.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    {t("bookings.detail.linkedMatches")} ({booking.matches.length})
                  </h3>
                  <div className="space-y-2">
                    {booking.matches.map((m) => {
                      const teamName = m.homeTeamCustomName ?? m.homeTeam;
                      const color = getTeamColor(teamName);
                      return (
                        <div
                          key={m.id}
                          className="rounded-md border px-3 py-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
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
                              <span className="text-sm">vs {m.guestTeam}</span>
                            </div>
                            <span className="tabular-nums text-sm text-muted-foreground">
                              {m.kickoffTime}
                            </span>
                          </div>
                          {m.leagueName && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {m.leagueName}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Notes */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("bookings.detail.notes")}
                </h3>
                <Field>
                  <Textarea
                    id="booking-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("bookings.detail.notesPlaceholder")}
                  />
                </Field>
              </section>
            </div>

            {/* Sticky footer */}
            <div className="border-t bg-background px-4 py-4">
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={handleClose}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t("common.saveChanges")}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full text-destructive hover:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("bookings.detail.delete")}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>

      {/* Discard confirmation dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("bookings.detail.discardTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("bookings.detail.discardDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard}>
              {t("bookings.detail.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("bookings.detail.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("bookings.detail.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("bookings.detail.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
