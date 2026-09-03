"use client";

import { useState, useCallback, useEffect, useId, useRef } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@dragons/ui/components/sheet";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { Combobox } from "@dragons/ui/components/combobox";
import type { ComboboxOption } from "@dragons/ui/components/combobox";
import { Textarea } from "@dragons/ui/components/textarea";
import { Switch } from "@dragons/ui/components/switch";
import { DatePicker } from "@dragons/ui/components/date-picker";
import { TimePicker } from "@dragons/ui/components/time-picker";
import { Separator } from "@dragons/ui/components/separator";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@dragons/ui/components/field";
import { Skeleton } from "@dragons/ui/components/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@dragons/ui/components/alert-dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@dragons/ui/components/popover";
import { AlertTriangle, Loader2, RotateCcw, Save, X, Users } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { can, clubDayAnchor, teamDisplayName } from "@dragons/shared";
import type { OwnClubTeam } from "@dragons/shared";
import { api } from "@/lib/api";
import { resolveVenueId, type SelectedVenue } from "@/lib/venue-selection";
import {
  formatMatchTime,
  formatPeriodScores,
} from "./utils";
import {
  matchFormSchema,
  type MatchDetail,
  type FieldDiff,
  type MatchFormValues,
} from "./types";
import type { MatchUpdateBody } from "@dragons/api-client";

// ---------------------------------------------------------------------------
// OverrideField — conditional layout (#2, #8)
// ---------------------------------------------------------------------------

function OverrideField({
  controlId,
  label,
  remoteDisplay,
  children,
  isOverridden,
  isDirty,
  onRelease,
  onReset,
  canEdit,
}: {
  /** id of the control this label names — without it the label is decoration. */
  controlId: string;
  label: string;
  remoteDisplay?: string;
  children: React.ReactNode;
  isOverridden?: boolean;
  isDirty?: boolean;
  onRelease?: () => void;
  onReset?: () => void;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const showHint = isOverridden || isDirty;

  return (
    <Field>
      <div className="flex min-h-6 items-center justify-between">
        <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
        <div className="flex items-center gap-1">
          {canEdit && isDirty && onReset && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={onReset}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              {t("common.reset")}
            </Button>
          )}
          {canEdit && isOverridden && onRelease && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={onRelease}
            >
              <X className="mr-1 h-3 w-3" />
              {t("common.release")}
            </Button>
          )}
        </div>
      </div>
      {children}
      {showHint && remoteDisplay && (
        <FieldDescription>
          {t("matchDetail.overrides.official")}: {remoteDisplay}
        </FieldDescription>
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Default form values
// ---------------------------------------------------------------------------

function getDefaultValues(match: MatchDetail): MatchFormValues {
  return {
    kickoffDate: match.kickoffDate,
    kickoffTime: match.kickoffTime,
    venueNameOverride: match.venueNameOverride ?? match.venueName,
    isForfeited: match.isForfeited ?? false,
    isCancelled: match.isCancelled ?? false,
    anschreiber: match.anschreiber,
    zeitnehmer: match.zeitnehmer,
    shotclock: match.shotclock,
    internalNotes: match.internalNotes,
    publicComment: match.publicComment,
  };
}

// ---------------------------------------------------------------------------
// Skeleton loading state (#5)
// ---------------------------------------------------------------------------

function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-4">
      <div className="rounded-md bg-muted/30 p-4">
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
      <Separator />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MatchEditSheet
// ---------------------------------------------------------------------------

interface MatchEditSheetProps {
  matchId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function MatchEditSheet({
  matchId,
  open,
  onOpenChange,
  onSaved,
}: MatchEditSheetProps) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  // One prefix per mounted sheet: `${fieldIds}-kickoffDate` names the control,
  // `${fieldIds}-kickoffDate-error` the message that describes it.
  const fieldIds = useId();
  const controlId = (name: keyof MatchFormValues) => `${fieldIds}-${name}`;
  const errorId = (name: keyof MatchFormValues) => `${fieldIds}-${name}-error`;
  const { data: session } = authClient.useSession();
  const canEdit = can(session?.user ?? null, "match", "update");
  const [loading, setLoading] = useState(false);
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [diffs, setDiffs] = useState<FieldDiff[]>([]);
  const [saving, setSaving] = useState(false);
  const [ownClubTeams, setOwnClubTeams] = useState<OwnClubTeam[]>([]);
  // Remembers both the id and the label it was picked under, so the id can be
  // reconciled against the text actually in the field at save time.
  const selectedVenueRef = useRef<SelectedVenue | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [setAllOpen, setSetAllOpen] = useState(false);

  const form = useForm<MatchFormValues>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: {
      kickoffDate: null,
      kickoffTime: null,
      venueNameOverride: null,
      isForfeited: null,
      isCancelled: null,
      anschreiber: null,
      zeitnehmer: null,
      shotclock: null,
      internalNotes: null,
      publicComment: null,
    },
    mode: "onBlur",
  });

  const { isDirty, dirtyFields } = form.formState;

  // Attempt to close: if dirty, show discard dialog; otherwise close
  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      onOpenChange(false);
    }
  }, [isDirty, onOpenChange]);

  // Confirmed discard
  const handleDiscard = useCallback(() => {
    form.reset();
    setShowDiscardDialog(false);
    onOpenChange(false);
  }, [form, onOpenChange]);

  // Fetch match detail when the sheet opens with a matchId.
  useEffect(() => {
    if (!open || matchId == null) return;

    let cancelled = false;
    setLoading(true);

    api.matches
      .get(matchId)
      .then((result) => {
        if (cancelled) return;
        setMatch(result.match);
        setDiffs(result.diffs);
        selectedVenueRef.current = null;
        form.reset(getDefaultValues(result.match));
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(t("matchDetail.toast.loadFailed"));
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    api.teams
      .list()
      .then((result) => {
        if (!cancelled) setOwnClubTeams(result);
      })
      .catch(() => {
        // Teams fetch failure is non-critical
      });

    return () => {
      cancelled = true;
    };
  }, [open, matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const getRemoteValue = useCallback(
    (field: string): string | null =>
      diffs.find((d) => d.field === field)?.remoteValue ?? null,
    [diffs],
  );

  const onSubmit = useCallback(
    async (data: MatchFormValues) => {
      if (!match) return;
      const { dirtyFields: currentDirtyFields } = form.formState;

      const dirtyValues: Partial<MatchFormValues> = {};
      for (const key of Object.keys(data) as (keyof typeof data)[]) {
        if (currentDirtyFields[key]) {
          (dirtyValues[key] as MatchFormValues[typeof key]) = data[key];
        }
      }

      const updateData: MatchUpdateBody = { ...dirtyValues };

      // Include venueId only when the text in the field still names the venue
      // that was picked from the combobox — a free-text edit since then means
      // the remembered id belongs to a different venue.
      if (currentDirtyFields.venueNameOverride) {
        const venueId = resolveVenueId(
          selectedVenueRef.current,
          data.venueNameOverride,
        );
        if (venueId != null) updateData.venueId = venueId;
      }

      if (Object.keys(updateData).length === 0) return;

      try {
        setSaving(true);
        const result = await api.matches.update(match.id, updateData);
        setMatch(result.match);
        setDiffs(result.diffs);
        selectedVenueRef.current = null;
        form.reset(getDefaultValues(result.match));
        toast.success(t("matchDetail.toast.updated"));
        router.refresh();
        onSaved?.();
      } catch {
        toast.error(t("matchDetail.toast.updateFailed"));
      } finally {
        setSaving(false);
      }
    },
    [match, form, router, onSaved, t],
  );

  const handleReleaseOverride = useCallback(
    async (fieldName: string) => {
      if (!match) return;
      try {
        setSaving(true);
        const result = await api.matches.releaseOverride(match.id, fieldName);
        setMatch(result.match);
        setDiffs(result.diffs);
        selectedVenueRef.current = null;
        form.reset(getDefaultValues(result.match));
        toast.success(t("matchDetail.toast.overrideReleased"));
        router.refresh();
        onSaved?.();
      } catch {
        toast.error(t("matchDetail.toast.overrideReleaseFailed"));
      } finally {
        setSaving(false);
      }
    },
    [match, form, router, onSaved, t],
  );

  // ---- Render ----

  const periodScores = match ? formatPeriodScores(match) : [];

  const remoteKickoffDate = match
    ? (getRemoteValue("kickoffDate") ?? match.kickoffDate)
    : null;
  const remoteKickoffTime = match
    ? (getRemoteValue("kickoffTime") ?? match.kickoffTime)
    : null;
  // Dirty field ring indicator (#6)
  const dirtyRing = (fieldName: keyof MatchFormValues) =>
    dirtyFields[fieldName] ? "ring-2 ring-primary/20 rounded-md" : "";

  return (
    <>
      <SheetContent
        className="data-[side=right]:sm:max-w-3xl"
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
        {/* Custom close button that checks dirty state */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-3 right-3"
          onClick={handleClose}
        >
          <X />
          <span className="sr-only">{t("common.close")}</span>
        </Button>

        <SheetHeader>
          <SheetTitle>
            {match
              ? t("matchDetail.editTitle", {
                  home: match.homeTeamName,
                  guest: match.guestTeamName,
                })
              : t("matches.title")}
          </SheetTitle>
          {match && (
            <SheetDescription>
              {t("matchDetail.info.matchdaySummary", {
                day: match.matchDay,
                league: match.leagueName ?? "\u2014",
              })}
            </SheetDescription>
          )}
        </SheetHeader>

        {loading || !match ? (
          <SheetSkeleton />
        ) : (
          <form
            onSubmit={(e) => { void form.handleSubmit(onSubmit)(e); }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
              {/* #1 — Read-only match info in card-like container */}
              <section className="rounded-md bg-muted/30 p-4">
                <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("matchDetail.info.title")}
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      {t("matchDetail.info.matchNo")}
                    </dt>
                    <dd className="font-medium">{match.matchNo}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("matchDetail.info.league")}
                    </dt>
                    <dd className="font-medium">
                      {match.leagueName ?? "\u2014"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("matchDetail.info.venue")}
                    </dt>
                    <dd className="font-medium">
                      {match.venueNameOverride ?? match.venueName ?? "\u2014"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("matchDetail.status.title")}
                    </dt>
                    <dd className="flex flex-wrap gap-1">
                      {match.isConfirmed && (
                        <Badge variant="default">
                          {t("matchDetail.status.confirmed")}
                        </Badge>
                      )}
                      {match.isForfeited && (
                        <Badge variant="destructive">
                          {t("matchDetail.status.forfeited")}
                        </Badge>
                      )}
                      {match.isCancelled && (
                        <Badge variant="destructive">
                          {t("matchDetail.status.cancelled")}
                        </Badge>
                      )}
                      {!match.isConfirmed &&
                        !match.isForfeited &&
                        !match.isCancelled && (
                          <span className="text-muted-foreground">
                            {t("matchDetail.status.noFlags")}
                          </span>
                        )}
                    </dd>
                  </div>
                </dl>

                {/* Score table — quarters, halftime, final in one view */}
                <div className="bg-card mt-4 overflow-x-auto rounded-md">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-low">
                        <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground" />
                        {periodScores.map((p) => (
                          <th
                            key={p.label}
                            className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
                          >
                            {p.label}
                          </th>
                        ))}
                        {periodScores.length > 0 && (
                          <th className="text-muted-foreground px-2 py-1.5 text-center text-xs font-medium">
                            {t("matchDetail.score.halftime")}
                          </th>
                        )}
                        <th className="px-2 py-1.5 text-center text-xs font-semibold">
                          {t("matchDetail.score.final")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-2 py-1.5 text-xs font-medium">{match.homeTeamName}</td>
                        {periodScores.map((p) => (
                          <td key={p.label} className="px-2 py-1.5 text-center tabular-nums">
                            {p.home ?? "\u2014"}
                          </td>
                        ))}
                        {periodScores.length > 0 && (
                          <td className="px-2 py-1.5 text-center tabular-nums">
                            {match.homeHalftimeScore ?? "\u2014"}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-center font-bold tabular-nums">
                          {match.homeScore ?? "\u2014"}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1.5 text-xs font-medium">{match.guestTeamName}</td>
                        {periodScores.map((p) => (
                          <td key={p.label} className="px-2 py-1.5 text-center tabular-nums">
                            {p.guest ?? "\u2014"}
                          </td>
                        ))}
                        {periodScores.length > 0 && (
                          <td className="px-2 py-1.5 text-center tabular-nums">
                            {match.guestHalftimeScore ?? "\u2014"}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-center font-bold tabular-nums">
                          {match.guestScore ?? "\u2014"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </section>

              <Separator />

              {/* Overrides */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("matchDetail.overrides.title")}
                </h3>

                {/* Date + Time side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Controller
                    control={form.control}
                    name="kickoffDate"
                    render={({ field }) => (
                      <OverrideField
                        controlId={controlId("kickoffDate")}
                        label={t("matchDetail.overrides.date")}
                        remoteDisplay={
                          remoteKickoffDate
                            ? format.dateTime(clubDayAnchor(remoteKickoffDate), "matchDate")
                            : undefined
                        }
                        isOverridden={match.overriddenFields.includes("kickoffDate")}
                        isDirty={!!dirtyFields.kickoffDate}
                        onRelease={() => { void handleReleaseOverride("kickoffDate"); }}
                        onReset={() => form.resetField("kickoffDate")}
                        canEdit={canEdit}
                      >
                        <div className={dirtyRing("kickoffDate")}>
                          <DatePicker
                            id={controlId("kickoffDate")}
                            value={
                              typeof field.value === "string" ? field.value : null
                            }
                            onChange={(v) => field.onChange(v)}
                            className="h-9 w-full"
                            disabled={!canEdit}
                          />
                        </div>
                      </OverrideField>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="kickoffTime"
                    render={({ field }) => (
                      <OverrideField
                        controlId={controlId("kickoffTime")}
                        label={t("matchDetail.overrides.time")}
                        remoteDisplay={
                          remoteKickoffTime
                            ? formatMatchTime(remoteKickoffTime)
                            : undefined
                        }
                        isOverridden={match.overriddenFields.includes("kickoffTime")}
                        isDirty={!!dirtyFields.kickoffTime}
                        onRelease={() => { void handleReleaseOverride("kickoffTime"); }}
                        onReset={() => form.resetField("kickoffTime")}
                        canEdit={canEdit}
                      >
                        <div className={dirtyRing("kickoffTime")}>
                          <TimePicker
                            id={controlId("kickoffTime")}
                            value={
                              typeof field.value === "string" ? field.value : null
                            }
                            onChange={(v) => field.onChange(v)}
                            className="h-9 w-full"
                            disabled={!canEdit}
                          />
                        </div>
                      </OverrideField>
                    )}
                  />
                </div>

                {/* #3 — Boolean toggles as inline switches */}
                <div className="space-y-3">
                  <Controller
                    control={form.control}
                    name="isForfeited"
                    render={({ field }) => (
                      <Field className="flex items-center justify-start gap-4 space-y-0">
                        <div className="flex items-center gap-2">
                          <FieldLabel htmlFor={controlId("isForfeited")}>
                            {t("matchDetail.overrides.forfeited")}
                          </FieldLabel>
                          {match.overriddenFields.includes("isForfeited") && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-primary"
                              title={t("matchDetail.overrideActive")}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            id={controlId("isForfeited")}
                            checked={field.value === true}
                            onCheckedChange={(checked) => field.onChange(checked)}
                            disabled={!canEdit}
                            className={dirtyFields.isForfeited ? "ring-2 ring-primary/20" : ""}
                          />
                          {canEdit && match.overriddenFields.includes("isForfeited") && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => { void handleReleaseOverride("isForfeited"); }}
                            >
                              <RotateCcw className="mr-1 h-3 w-3" />
                              {t("common.release")}
                            </Button>
                          )}
                        </div>
                      </Field>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="isCancelled"
                    render={({ field }) => (
                      <Field className="flex items-center justify-start gap-4 space-y-0">
                        <div className="flex items-center gap-2">
                          <FieldLabel htmlFor={controlId("isCancelled")}>
                            {t("matchDetail.overrides.cancelled")}
                          </FieldLabel>
                          {match.overriddenFields.includes("isCancelled") && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-primary"
                              title={t("matchDetail.overrideActive")}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            id={controlId("isCancelled")}
                            checked={field.value === true}
                            onCheckedChange={(checked) => field.onChange(checked)}
                            disabled={!canEdit}
                            className={dirtyFields.isCancelled ? "ring-2 ring-primary/20" : ""}
                          />
                          {canEdit && match.overriddenFields.includes("isCancelled") && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => { void handleReleaseOverride("isCancelled"); }}
                            >
                              <RotateCcw className="mr-1 h-3 w-3" />
                              {t("common.release")}
                            </Button>
                          )}
                        </div>
                      </Field>
                    )}
                  />
                </div>

                {/* Venue */}
                <Controller
                  control={form.control}
                  name="venueNameOverride"
                  render={({ field, fieldState }) => (
                    <OverrideField
                      controlId={controlId("venueNameOverride")}
                      label={t("matchDetail.overrides.venue")}
                      remoteDisplay={
                        match.venueName
                          ? [
                            match.venueName,
                            [match.venueStreet, match.venueCity]
                              .filter(Boolean)
                              .join(", "),
                          ]
                            .filter(Boolean)
                            .join(" \u2014 ")
                          : undefined
                      }
                      isOverridden={match.overriddenFields.includes(
                        "venueNameOverride",
                      )}
                      isDirty={!!dirtyFields.venueNameOverride}
                      onRelease={() => { void handleReleaseOverride("venueNameOverride"); }}
                      onReset={() => form.resetField("venueNameOverride")}
                      canEdit={canEdit}
                    >
                      <div className={dirtyRing("venueNameOverride")}>
                        <Combobox
                          id={controlId("venueNameOverride")}
                          aria-invalid={!!fieldState.error}
                          aria-describedby={
                            fieldState.error
                              ? errorId("venueNameOverride")
                              : undefined
                          }
                          value={field.value ?? ""}
                          onChange={(v) => field.onChange(v || null)}
                          onSearch={async (q) => {
                            const result = await api.venues.search({ q });
                            return result.venues.map(
                              (v): ComboboxOption => ({
                                value: String(v.id),
                                label: v.name,
                                description: [v.street, v.city]
                                  .filter(Boolean)
                                  .join(", ") || undefined,
                              }),
                            );
                          }}
                          onSelect={(option) => {
                            field.onChange(option.label);
                            selectedVenueRef.current = {
                              id: Number(option.value),
                              label: option.label,
                            };
                          }}
                          placeholder={t("matchDetail.overrides.venuePlaceholder")}
                          className="h-9"
                          disabled={!canEdit}
                        />
                      </div>
                      <FieldError id={errorId("venueNameOverride")}>
                        {fieldState.error?.message}
                      </FieldError>
                    </OverrideField>
                  )}
                />
              </section>

              <Separator />

              {/* Officials */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("matchDetail.staff.title")}
                </h3>

                {/* #7 — Set All as button + popover */}
                <Popover open={setAllOpen} onOpenChange={canEdit ? setSetAllOpen : undefined}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={!canEdit}>
                      <Users className="mr-2 h-3.5 w-3.5" />
                      {t("matchDetail.staff.setAll")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-48 p-1">
                    {ownClubTeams.map((team) => {
                      const displayName = teamDisplayName(team);
                      return (
                        <button
                          key={team.id}
                          type="button"
                          className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => {
                            form.setValue("anschreiber", displayName, { shouldDirty: true });
                            form.setValue("zeitnehmer", displayName, { shouldDirty: true });
                            form.setValue("shotclock", displayName, { shouldDirty: true });
                            setSetAllOpen(false);
                          }}
                        >
                          {displayName}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>

                {/* Per-role dropdowns — 3-column grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {(["anschreiber", "zeitnehmer", "shotclock"] as const).map((fieldName) => (
                    <Controller
                      key={fieldName}
                      control={form.control}
                      name={fieldName}
                      render={({ field, fieldState }) => (
                        <Field>
                          <FieldLabel htmlFor={controlId(fieldName)}>
                            {t(`matchDetail.staff.${fieldName}`)}
                          </FieldLabel>
                          <div className="flex items-center gap-1">
                            <Select
                              value={field.value ?? ""}
                              onValueChange={(v) => field.onChange(v)}
                              disabled={!canEdit}
                            >
                              <SelectTrigger
                                id={controlId(fieldName)}
                                aria-invalid={!!fieldState.error}
                                aria-describedby={
                                  fieldState.error ? errorId(fieldName) : undefined
                                }
                                className={`h-9 w-full ${dirtyRing(fieldName)}`}
                              >
                                <SelectValue placeholder={t("matchDetail.staff.placeholder")} />
                              </SelectTrigger>
                              <SelectContent>
                                {ownClubTeams.map((team) => {
                                  const displayName = teamDisplayName(team);
                                  return (
                                    <SelectItem key={team.id} value={displayName}>
                                      {displayName}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {canEdit && field.value && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 text-muted-foreground"
                                aria-label={t("matchDetail.staff.clear", {
                                  role: t(`matchDetail.staff.${fieldName}`),
                                })}
                                onClick={() => field.onChange(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <FieldError id={errorId(fieldName)}>
                            {fieldState.error?.message}
                          </FieldError>
                        </Field>
                      )}
                    />
                  ))}
                </div>
              </section>

              {/* Booking */}
              {match.booking && (
                <>
                  <Separator />
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                      {t("matchDetail.booking.title")}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          match.booking.status === "confirmed"
                            ? "success"
                            : match.booking.status === "requested"
                              ? "default"
                              : match.booking.status === "cancelled"
                                ? "destructive"
                                : "secondary"
                        }
                      >
                        {t(`bookings.status.${match.booking.status}`)}
                      </Badge>
                      {match.booking.needsReconfirmation && (
                        <span className="text-heat inline-flex items-center gap-1 text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          {t("matchDetail.booking.needsReconfirmation")}
                        </span>
                      )}
                    </div>
                  </section>
                </>
              )}

              <Separator />

              {/* Notes */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("matchDetail.notes.title")}
                </h3>

                <Controller
                  control={form.control}
                  name="internalNotes"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor={controlId("internalNotes")}>
                        {t("matchDetail.notes.internal")}
                      </FieldLabel>
                      <FieldDescription id={`${controlId("internalNotes")}-hint`}>
                        {t("matchDetail.notes.internalDescription")}
                      </FieldDescription>
                      <Textarea
                        id={controlId("internalNotes")}
                        rows={4}
                        aria-invalid={!!fieldState.error}
                        aria-describedby={
                          fieldState.error
                            ? `${controlId("internalNotes")}-hint ${errorId("internalNotes")}`
                            : `${controlId("internalNotes")}-hint`
                        }
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        disabled={!canEdit}
                        className={dirtyRing("internalNotes")}
                      />
                      <FieldError id={errorId("internalNotes")}>
                        {fieldState.error?.message}
                      </FieldError>
                    </Field>
                  )}
                />

                <Controller
                  control={form.control}
                  name="publicComment"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor={controlId("publicComment")}>
                        {t("matchDetail.notes.public")}
                      </FieldLabel>
                      <FieldDescription id={`${controlId("publicComment")}-hint`}>
                        {t("matchDetail.notes.publicDescription")}
                      </FieldDescription>
                      <Textarea
                        id={controlId("publicComment")}
                        rows={3}
                        aria-invalid={!!fieldState.error}
                        aria-describedby={
                          fieldState.error
                            ? `${controlId("publicComment")}-hint ${errorId("publicComment")}`
                            : `${controlId("publicComment")}-hint`
                        }
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        disabled={!canEdit}
                        className={dirtyRing("publicComment")}
                      />
                      <FieldError id={errorId("publicComment")}>
                        {fieldState.error?.message}
                      </FieldError>
                    </Field>
                  )}
                />
              </section>

            </div>

            {/* #4 — Footer: Cancel + Save — sticky at bottom */}
            <div className="bg-surface-low flex gap-2 px-4 py-4">
              {canEdit ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={handleClose}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving || !isDirty}
                    className="flex-1"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t("common.saveChanges")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleClose}
                >
                  {t("common.close")}
                </Button>
              )}
            </div>
          </form>
        )}
      </SheetContent>

      {/* #4 — Discard confirmation dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("matchDetail.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("matchDetail.discardDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard}>
              {t("matchDetail.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
