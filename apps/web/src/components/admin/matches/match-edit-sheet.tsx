"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

import { fetchAPI } from "@/lib/api";
import {
  formatMatchTime,
  formatPeriodScores,
} from "./utils";
import {
  matchFormSchema,
  type MatchDetail,
  type MatchDetailResponse,
  type FieldDiff,
  type MatchFormValues,
} from "./types";

// ---------------------------------------------------------------------------
// OverrideField — conditional layout (#2, #8)
// ---------------------------------------------------------------------------

function OverrideField({
  label,
  remoteDisplay,
  children,
  isOverridden,
  isDirty,
  onRelease,
  onReset,
}: {
  label: string;
  remoteDisplay?: string;
  children: React.ReactNode;
  isOverridden?: boolean;
  isDirty?: boolean;
  onRelease?: () => void;
  onReset?: () => void;
}) {
  const t = useTranslations();
  const showHint = isOverridden || isDirty;

  return (
    <Field>
      <div className="flex min-h-6 items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <div className="flex items-center gap-1">
          {isDirty && onReset && (
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
          {isOverridden && onRelease && (
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
// Team types & helpers
// ---------------------------------------------------------------------------

interface OwnClubTeam {
  id: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  leagueName: string | null;
}

function getTeamDisplayName(team: OwnClubTeam): string {
  return team.customName ?? team.nameShort ?? team.name;
}

// ---------------------------------------------------------------------------
// Skeleton loading state (#5)
// ---------------------------------------------------------------------------

function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-4">
      <div className="rounded-lg bg-muted/30 p-4">
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
  const [loading, setLoading] = useState(false);
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [diffs, setDiffs] = useState<FieldDiff[]>([]);
  const [saving, setSaving] = useState(false);
  const [ownClubTeams, setOwnClubTeams] = useState<OwnClubTeam[]>([]);
  const selectedVenueIdRef = useRef<number | null>(null);
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

    fetchAPI<MatchDetailResponse>(`/admin/matches/${matchId}`)
      .then((result) => {
        if (cancelled) return;
        setMatch(result.match);
        setDiffs(result.diffs);
        selectedVenueIdRef.current = null;
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

    fetchAPI<OwnClubTeam[]>("/admin/teams")
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

      const updateData: Record<string, unknown> = {};
      for (const key of Object.keys(data) as (keyof typeof data)[]) {
        if (currentDirtyFields[key]) {
          updateData[key] = data[key];
        }
      }

      // Include venueId when a venue was selected from the combobox
      if (currentDirtyFields.venueNameOverride && selectedVenueIdRef.current != null) {
        updateData.venueId = selectedVenueIdRef.current;
      }

      if (Object.keys(updateData).length === 0) return;

      try {
        setSaving(true);
        const result = await fetchAPI<MatchDetailResponse>(
          `/admin/matches/${match.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(updateData),
          },
        );
        setMatch(result.match);
        setDiffs(result.diffs);
        selectedVenueIdRef.current = null;
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
        const result = await fetchAPI<MatchDetailResponse>(
          `/admin/matches/${match.id}/overrides/${fieldName}`,
          { method: "DELETE" },
        );
        setMatch(result.match);
        setDiffs(result.diffs);
        selectedVenueIdRef.current = null;
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
          <span className="sr-only">Close</span>
        </Button>

        <SheetHeader>
          <SheetTitle>
            {match
              ? `${match.homeTeamName} vs ${match.guestTeamName}`
              : t("matches.title")}
          </SheetTitle>
          {match && (
            <SheetDescription>
              {t("matchDetail.info.matchday")} {match.matchDay} &middot;{" "}
              {match.leagueName ?? "\u2014"}
            </SheetDescription>
          )}
        </SheetHeader>

        {loading || !match ? (
          <SheetSkeleton />
        ) : (
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
              {/* #1 — Read-only match info in card-like container */}
              <section className="rounded-lg bg-muted/30 p-4">
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
                        <Badge variant="success">
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
                <div className="mt-4 overflow-x-auto rounded-md border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b">
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
                          <th className="border-l px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
                            {t("matchDetail.score.halftime")}
                          </th>
                        )}
                        <th className={`px-2 py-1.5 text-center text-xs font-semibold${periodScores.length > 0 ? "" : " border-l"}`}>
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
                          <td className="border-l px-2 py-1.5 text-center tabular-nums">
                            {match.homeHalftimeScore ?? "\u2014"}
                          </td>
                        )}
                        <td className={`px-2 py-1.5 text-center font-bold tabular-nums${periodScores.length > 0 ? "" : " border-l"}`}>
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
                          <td className="border-l px-2 py-1.5 text-center tabular-nums">
                            {match.guestHalftimeScore ?? "\u2014"}
                          </td>
                        )}
                        <td className={`px-2 py-1.5 text-center font-bold tabular-nums${periodScores.length > 0 ? "" : " border-l"}`}>
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
                        label={t("matchDetail.overrides.date")}
                        remoteDisplay={
                          remoteKickoffDate
                            ? format.dateTime(new Date(remoteKickoffDate + "T00:00:00"), "matchDate")
                            : undefined
                        }
                        isOverridden={match.overriddenFields.includes("kickoffDate")}
                        isDirty={!!dirtyFields.kickoffDate}
                        onRelease={() => handleReleaseOverride("kickoffDate")}
                        onReset={() => form.resetField("kickoffDate")}
                      >
                        <div className={dirtyRing("kickoffDate")}>
                          <DatePicker
                            value={
                              typeof field.value === "string" ? field.value : null
                            }
                            onChange={(v) => field.onChange(v)}
                            className="h-9 w-full"
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
                        label={t("matchDetail.overrides.time")}
                        remoteDisplay={
                          remoteKickoffTime
                            ? formatMatchTime(remoteKickoffTime)
                            : undefined
                        }
                        isOverridden={match.overriddenFields.includes("kickoffTime")}
                        isDirty={!!dirtyFields.kickoffTime}
                        onRelease={() => handleReleaseOverride("kickoffTime")}
                        onReset={() => form.resetField("kickoffTime")}
                      >
                        <div className={dirtyRing("kickoffTime")}>
                          <TimePicker
                            value={
                              typeof field.value === "string" ? field.value : null
                            }
                            onChange={(v) => field.onChange(v)}
                            className="h-9 w-full"
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
                          <FieldLabel>
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
                            checked={field.value === true}
                            onCheckedChange={(checked) => field.onChange(checked)}
                            className={dirtyFields.isForfeited ? "ring-2 ring-primary/20" : ""}
                          />
                          {match.overriddenFields.includes("isForfeited") && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => handleReleaseOverride("isForfeited")}
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
                          <FieldLabel>
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
                            checked={field.value === true}
                            onCheckedChange={(checked) => field.onChange(checked)}
                            className={dirtyFields.isCancelled ? "ring-2 ring-primary/20" : ""}
                          />
                          {match.overriddenFields.includes("isCancelled") && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => handleReleaseOverride("isCancelled")}
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
                      onRelease={() =>
                        handleReleaseOverride("venueNameOverride")
                      }
                      onReset={() => form.resetField("venueNameOverride")}
                    >
                      <div className={dirtyRing("venueNameOverride")}>
                        <Combobox
                          value={field.value ?? ""}
                          onChange={(v) => field.onChange(v || null)}
                          onSearch={async (q) => {
                            const result = await fetchAPI<{
                              venues: {
                                id: number;
                                name: string;
                                street: string | null;
                                city: string | null;
                              }[];
                            }>(`/admin/venues/search?q=${encodeURIComponent(q)}`);
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
                            selectedVenueIdRef.current = Number(option.value);
                          }}
                          placeholder={t("matchDetail.overrides.venuePlaceholder")}
                          className="h-9"
                        />
                      </div>
                      <FieldError>{fieldState.error?.message}</FieldError>
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
                <Popover open={setAllOpen} onOpenChange={setSetAllOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <Users className="mr-2 h-3.5 w-3.5" />
                      {t("matchDetail.staff.setAll")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-48 p-1">
                    {ownClubTeams.map((team) => {
                      const displayName = getTeamDisplayName(team);
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
                          <FieldLabel>{t(`matchDetail.staff.${fieldName}`)}</FieldLabel>
                          <div className="flex items-center gap-1">
                            <Select
                              value={field.value ?? ""}
                              onValueChange={(v) => field.onChange(v)}
                            >
                              <SelectTrigger className={`h-9 w-full ${dirtyRing(fieldName)}`}>
                                <SelectValue placeholder={t("matchDetail.staff.placeholder")} />
                              </SelectTrigger>
                              <SelectContent>
                                {ownClubTeams.map((team) => {
                                  const displayName = getTeamDisplayName(team);
                                  return (
                                    <SelectItem key={team.id} value={displayName}>
                                      {displayName}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {field.value && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 text-muted-foreground"
                                onClick={() => field.onChange(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <FieldError>{fieldState.error?.message}</FieldError>
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
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
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
                      <FieldLabel>{t("matchDetail.notes.internal")}</FieldLabel>
                      <FieldDescription>
                        {t("matchDetail.notes.internalDescription")}
                      </FieldDescription>
                      <Textarea
                        rows={4}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        className={dirtyRing("internalNotes")}
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />

                <Controller
                  control={form.control}
                  name="publicComment"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel>{t("matchDetail.notes.public")}</FieldLabel>
                      <FieldDescription>
                        {t("matchDetail.notes.publicDescription")}
                      </FieldDescription>
                      <Textarea
                        rows={3}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        className={dirtyRing("publicComment")}
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
              </section>

            </div>

            {/* #4 — Footer: Cancel + Save — sticky at bottom */}
            <div className="flex gap-2 border-t bg-background px-4 py-4">
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
