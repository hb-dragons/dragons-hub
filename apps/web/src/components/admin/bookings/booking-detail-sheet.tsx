"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { api } from "@/lib/api";
import { clubDayAnchor, clubTimeAnchor } from "@dragons/shared";
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
import { authClient } from "@/lib/auth-client";
import { can } from "@dragons/shared";
import { TeamBadge } from "@/components/admin/shared/team-badge";
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
  const { data: session } = authClient.useSession();
  const canUpdate = can(session?.user ?? null, "booking", "update");
  const canDelete = can(session?.user ?? null, "booking", "delete");
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

    api.bookings
      .get(bookingId)
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
        await api.bookings.updateStatus(bookingId, {
          status: status as BookingDetail["status"],
        });
      }

      // Send override times only when they differ from calculated
      const calcStart = booking.calculatedStartTime ?? "";
      const calcEnd = booking.calculatedEndTime ?? "";
      const overrideStart = startTime && startTime !== calcStart ? startTime : null;
      const overrideEnd = endTime && endTime !== calcEnd ? endTime : null;

      await api.bookings.update(bookingId, {
        overrideStartTime: overrideStart,
        overrideEndTime: overrideEnd,
        overrideReason: overrideReason || null,
        notes: notes || null,
      });

      // Re-fetch full detail to get complete BookingDetail shape
      const result = await api.bookings.get(bookingId);
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
      await api.bookings.delete(bookingId);
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
                  <span className="text-heat inline-flex items-center gap-1 text-xs">
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
              {format.dateTime(clubDayAnchor(booking.date), "matchDate")}
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
                      disabled={status === s || !canUpdate}
                    >
                      {t(`bookings.status.${s}`)}
                    </Button>
                  ))}
                </div>

              {booking.needsReconfirmation && (
                <div className="bg-heat/10 text-heat rounded-md p-3 text-sm">
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
                      disabled={!canUpdate}
                    />
                    {booking.calculatedStartTime && startTime !== booking.calculatedStartTime && (
                      <p className="text-xs text-muted-foreground">
                        {t("bookings.detail.calculated")}: {format.dateTime(clubTimeAnchor(booking.calculatedStartTime, booking.date), "matchTime")}
                      </p>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>{t("bookings.detail.endTime")}</FieldLabel>
                    <TimePicker
                      value={endTime.slice(0, 5) || null}
                      onChange={(v) => setEndTime(v ? v + ":00" : "")}
                      className="h-9 w-full"
                      disabled={!canUpdate}
                    />
                    {booking.calculatedEndTime && endTime !== booking.calculatedEndTime && (
                      <p className="text-xs text-muted-foreground">
                        {t("bookings.detail.calculated")}: {format.dateTime(clubTimeAnchor(booking.calculatedEndTime, booking.date), "matchTime")}
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
                      disabled={!canUpdate}
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
                      return (
                        <div
                          key={m.id}
                          className="bg-surface-low rounded-md px-3 py-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TeamBadge name={teamName} badgeColor={m.homeBadgeColor} />
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
                    disabled={!canUpdate}
                  />
                </Field>
              </section>
            </div>

            {/* Sticky footer */}
            <div className="bg-surface-low px-4 py-4">
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={handleClose}
                >
                  {canUpdate ? t("common.cancel") : t("common.close")}
                </Button>
                {canUpdate && (
                  <Button
                    className="flex-1"
                    onClick={() => { void handleSave(); }}
                    disabled={saving || !isDirty}
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t("common.saveChanges")}
                  </Button>
                )}
              </div>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("bookings.detail.delete")}
                </Button>
              )}
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
            <AlertDialogAction onClick={() => { void handleDelete(); }} disabled={deleting}>
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
