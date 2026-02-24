"use client";

import { useState, useCallback, useEffect } from "react";
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
import { Input } from "@dragons/ui/components/input";
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
import { Loader2, RotateCcw, Save } from "lucide-react";

import { fetchAPI } from "@/lib/api";
import {
  formatMatchTime,
  formatScore,
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
// OverrideField helper — side-by-side official / local comparison
// ---------------------------------------------------------------------------

function OverrideField({
  label,
  remoteValue,
  remoteDisplay,
  children,
  isOverridden,
  onRelease,
}: {
  label: string;
  remoteValue: string | null;
  remoteDisplay?: string;
  children: React.ReactNode;
  isOverridden?: boolean;
  onRelease?: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {isOverridden && onRelease && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={onRelease}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {t("common.release")}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">
            {t("matchDetail.overrides.official")}
          </span>
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
            {remoteDisplay ?? remoteValue ?? "\u2014"}
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">
            {t("matchDetail.overrides.local")}
          </span>
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default form values — mirrors match-detail-view logic
// ---------------------------------------------------------------------------

function getDefaultValues(match: MatchDetail): MatchFormValues {
  return {
    kickoffDate: match.overriddenFields.includes("kickoffDate")
      ? match.kickoffDate
      : null,
    kickoffTime: match.overriddenFields.includes("kickoffTime")
      ? match.kickoffTime
      : null,
    venueNameOverride: match.venueNameOverride,
    isForfeited: match.overriddenFields.includes("isForfeited")
      ? match.isForfeited
      : null,
    isCancelled: match.overriddenFields.includes("isCancelled")
      ? match.isCancelled
      : null,
    anschreiber: match.anschreiber,
    zeitnehmer: match.zeitnehmer,
    shotclock: match.shotclock,
    internalNotes: match.internalNotes,
    publicComment: match.publicComment,
    changeReason: "",
  };
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
      changeReason: "",
    },
    mode: "onBlur",
  });

  const { isDirty } = form.formState;

  // Fetch match detail when the sheet opens with a matchId
  useEffect(() => {
    if (!open || matchId == null) {
      setMatch(null);
      setDiffs([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchAPI<MatchDetailResponse>(`/admin/matches/${matchId}`)
      .then((result) => {
        if (cancelled) return;
        setMatch(result.match);
        setDiffs(result.diffs);
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

  // Look up the remote value for a given field from the diffs array
  const getRemoteValue = useCallback(
    (field: string): string | null =>
      diffs.find((d) => d.field === field)?.remoteValue ?? null,
    [diffs],
  );

  const onSubmit = useCallback(
    async (data: MatchFormValues) => {
      if (!match) return;
      const { changeReason, ...fields } = data;
      const updateData: Record<string, unknown> = { ...fields };
      if (changeReason) {
        updateData.changeReason = changeReason;
      }

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

  // For non-overridden fields, diffs may be empty — fall back to match values
  // (which ARE the remote values when no override exists)
  const remoteKickoffDate = match
    ? (getRemoteValue("kickoffDate") ?? match.kickoffDate)
    : null;
  const remoteKickoffTime = match
    ? (getRemoteValue("kickoffTime") ?? match.kickoffTime)
    : null;
  const remoteIsForfeited = match
    ? (getRemoteValue("isForfeited") ?? String(match.isForfeited ?? false))
    : null;
  const remoteIsCancelled = match
    ? (getRemoteValue("isCancelled") ?? String(match.isCancelled ?? false))
    : null;

  return (
    <SheetContent className="data-[side=right]:sm:max-w-3xl">
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
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
           <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
            {/* Match info */}
            <section>
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
                    {t("matchDetail.info.matchday")}
                  </dt>
                  <dd className="font-medium">{match.matchDay}</dd>
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
                <div>
                  <dt className="text-muted-foreground">
                    {t("matchDetail.score.final")}
                  </dt>
                  <dd className="font-bold tabular-nums">
                    {formatScore(match.homeScore, match.guestScore)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("matchDetail.score.halftime")}
                  </dt>
                  <dd className="tabular-nums">
                    {formatScore(
                      match.homeHalftimeScore,
                      match.guestHalftimeScore,
                    )}
                  </dd>
                </div>
              </dl>

              {/* Period scores table */}
              {periodScores.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="px-2 py-1 text-left text-xs font-medium text-muted-foreground" />
                        {periodScores.map((p) => (
                          <th
                            key={p.label}
                            className="px-2 py-1 text-center text-xs font-medium text-muted-foreground"
                          >
                            {p.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-2 py-1 text-xs font-medium">
                          {match.homeTeamName}
                        </td>
                        {periodScores.map((p) => (
                          <td
                            key={p.label}
                            className="px-2 py-1 text-center tabular-nums"
                          >
                            {p.home ?? "\u2014"}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-2 py-1 text-xs font-medium">
                          {match.guestTeamName}
                        </td>
                        {periodScores.map((p) => (
                          <td
                            key={p.label}
                            className="px-2 py-1 text-center tabular-nums"
                          >
                            {p.guest ?? "\u2014"}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sync metadata */}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div>
                  {t("matchDetail.status.lastSync", {
                    value: match.lastRemoteSync
                      ? format.dateTime(new Date(match.lastRemoteSync), "syncTimestamp")
                      : "\u2014",
                  })}
                </div>
                <div>
                  {t("matchDetail.status.remoteVersion", { version: match.currentRemoteVersion })}
                </div>
              </div>
            </section>

            <Separator />

            {/* Overrides */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {t("matchDetail.overrides.title")}
              </h3>

              {/* Date */}
              <Controller
                control={form.control}
                name="kickoffDate"
                render={({ field }) => (
                  <OverrideField
                    label={t("matchDetail.overrides.date")}
                    remoteValue={remoteKickoffDate}
                    remoteDisplay={
                      remoteKickoffDate
                        ? format.dateTime(new Date(remoteKickoffDate + "T00:00:00"), "matchDate")
                        : undefined
                    }
                    isOverridden={match.overriddenFields.includes(
                      "kickoffDate",
                    )}
                    onRelease={() => handleReleaseOverride("kickoffDate")}
                  >
                    <DatePicker
                      value={
                        typeof field.value === "string" ? field.value : null
                      }
                      onChange={(v) => field.onChange(v)}
                      className="h-9 w-full"
                    />
                  </OverrideField>
                )}
              />

              {/* Time */}
              <Controller
                control={form.control}
                name="kickoffTime"
                render={({ field }) => (
                  <OverrideField
                    label={t("matchDetail.overrides.time")}
                    remoteValue={remoteKickoffTime}
                    remoteDisplay={
                      remoteKickoffTime
                        ? formatMatchTime(remoteKickoffTime)
                        : undefined
                    }
                    isOverridden={match.overriddenFields.includes(
                      "kickoffTime",
                    )}
                    onRelease={() => handleReleaseOverride("kickoffTime")}
                  >
                    <TimePicker
                      value={
                        typeof field.value === "string" ? field.value : null
                      }
                      onChange={(v) => field.onChange(v)}
                      className="h-9 w-full"
                    />
                  </OverrideField>
                )}
              />

              {/* Forfeited */}
              <Controller
                control={form.control}
                name="isForfeited"
                render={({ field }) => (
                  <OverrideField
                    label={t("matchDetail.overrides.forfeited")}
                    remoteValue={remoteIsForfeited}
                    remoteDisplay={
                      remoteIsForfeited === "true"
                        ? t("common.yes")
                        : t("common.no")
                    }
                    isOverridden={match.overriddenFields.includes(
                      "isForfeited",
                    )}
                    onRelease={() => handleReleaseOverride("isForfeited")}
                  >
                    <div className="flex items-center rounded-md border px-3 py-2">
                      <Switch
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked)}
                      />
                      <span className="ml-2 text-sm">
                        {field.value ? t("common.yes") : t("common.no")}
                      </span>
                    </div>
                  </OverrideField>
                )}
              />

              {/* Cancelled */}
              <Controller
                control={form.control}
                name="isCancelled"
                render={({ field }) => (
                  <OverrideField
                    label={t("matchDetail.overrides.cancelled")}
                    remoteValue={remoteIsCancelled}
                    remoteDisplay={
                      remoteIsCancelled === "true"
                        ? t("common.yes")
                        : t("common.no")
                    }
                    isOverridden={match.overriddenFields.includes(
                      "isCancelled",
                    )}
                    onRelease={() => handleReleaseOverride("isCancelled")}
                  >
                    <div className="flex items-center rounded-md border px-3 py-2">
                      <Switch
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked)}
                      />
                      <span className="ml-2 text-sm">
                        {field.value ? t("common.yes") : t("common.no")}
                      </span>
                    </div>
                  </OverrideField>
                )}
              />

              {/* Venue name (local-only, no diff) */}
              <Controller
                control={form.control}
                name="venueNameOverride"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t("matchDetail.overrides.venue")}</FieldLabel>
                    <Input
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value || null)
                      }
                      onBlur={field.onBlur}
                      className="h-9"
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </Field>
                )}
              />
            </section>

            <Separator />

            {/* Officials */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {t("matchDetail.staff.title")}
              </h3>

              <Controller
                control={form.control}
                name="anschreiber"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t("matchDetail.staff.anschreiber")}</FieldLabel>
                    <Input
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value || null)
                      }
                      onBlur={field.onBlur}
                      className="h-9"
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="zeitnehmer"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t("matchDetail.staff.zeitnehmer")}</FieldLabel>
                    <Input
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value || null)
                      }
                      onBlur={field.onBlur}
                      className="h-9"
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="shotclock"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t("matchDetail.staff.shotclock")}</FieldLabel>
                    <Input
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value || null)
                      }
                      onBlur={field.onBlur}
                      className="h-9"
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </Field>
                )}
              />
            </section>

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
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </Field>
                )}
              />
            </section>

           </div>

            {/* Footer: change reason + save — sticky at bottom */}
            <div className="border-t bg-background px-4 py-4 space-y-4">
              <Controller
                control={form.control}
                name="changeReason"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t("matchDetail.changeReason.label")}</FieldLabel>
                    <FieldDescription>
                      {t("matchDetail.changeReason.description")}
                    </FieldDescription>
                    <Input
                      placeholder={t("matchDetail.changeReason.placeholder")}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      className="h-9"
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </Field>
                )}
              />
              <Button
                type="submit"
                disabled={saving || !isDirty}
                className="w-full"
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
        </>
      )}
    </SheetContent>
  );
}
