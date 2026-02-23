"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { Link } from "@/lib/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Textarea } from "@dragons/ui/components/textarea";
import { Separator } from "@dragons/ui/components/separator";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@dragons/ui/components/field";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { MatchOverrideField } from "./match-override-field";
import {
  formatMatchDate,
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

interface MatchDetailViewProps {
  initialData: MatchDetailResponse;
}

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

export function MatchDetailView({ initialData }: MatchDetailViewProps) {
  const t = useTranslations();
  const router = useRouter();
  const [match, setMatch] = useState<MatchDetail>(initialData.match);
  const [diffs, setDiffs] = useState<FieldDiff[]>(initialData.diffs);
  const [saving, setSaving] = useState(false);

  const form = useForm<MatchFormValues>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: getDefaultValues(initialData.match),
    mode: "onBlur",
  });

  const { isDirty } = form.formState;

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

  const getDiffStatus = useCallback(
    (field: string) => diffs.find((d) => d.field === field)?.status,
    [diffs],
  );

  const onSubmit = useCallback(
    async (data: MatchFormValues) => {
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
      } catch {
        toast.error(t("matchDetail.toast.updateFailed"));
      } finally {
        setSaving(false);
      }
    },
    [match.id, form, router, t],
  );

  const handleReleaseOverride = useCallback(
    async (fieldName: string) => {
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
      } catch {
        toast.error(t("matchDetail.toast.overrideReleaseFailed"));
      } finally {
        setSaving(false);
      }
    },
    [match.id, form, router, t],
  );

  const periodScores = formatPeriodScores(match);
  const overrideCount = match.overrides.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/matches">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("common.back")}
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {match.homeTeamName} vs {match.guestTeamName}
          </h1>
          <p className="text-muted-foreground">{t("matchDetail.matchday", { day: match.matchDay })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{t("matchDetail.matchdayBadge", { day: match.matchDay })}</Badge>
          {overrideCount > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500 text-amber-600"
            >
              {t("matchDetail.overrideCount", { count: overrideCount })}
            </Badge>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column: Read-only reference */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("matchDetail.info.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t("matchDetail.info.matchNo")}</dt>
                    <dd className="font-medium">{match.matchNo}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("matchDetail.info.matchday")}</dt>
                    <dd className="font-medium">{match.matchDay}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("matchDetail.info.league")}</dt>
                    <dd className="font-medium">
                      {match.leagueName ?? "\u2014"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("matchDetail.info.date")}</dt>
                    <dd className="font-medium">
                      {formatMatchDate(match.kickoffDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("matchDetail.info.time")}</dt>
                    <dd className="font-medium">
                      {formatMatchTime(match.kickoffTime)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("matchDetail.info.venue")}</dt>
                    <dd className="font-medium">
                      {match.venueNameOverride ?? match.venueName ?? "\u2014"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("matchDetail.score.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t("matchDetail.score.final")}</dt>
                    <dd className="text-lg font-bold tabular-nums">
                      {formatScore(match.homeScore, match.guestScore)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("matchDetail.score.halftime")}</dt>
                    <dd className="text-lg font-bold tabular-nums">
                      {formatScore(
                        match.homeHalftimeScore,
                        match.guestHalftimeScore,
                      )}
                    </dd>
                  </div>
                </div>

                {periodScores.length > 0 && (
                  <div className="overflow-x-auto">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("matchDetail.status.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {match.isConfirmed && (
                    <Badge variant="success">{t("matchDetail.status.confirmed")}</Badge>
                  )}
                  {match.isForfeited && (
                    <Badge variant="destructive">{t("matchDetail.status.forfeited")}</Badge>
                  )}
                  {match.isCancelled && (
                    <Badge variant="destructive">{t("matchDetail.status.cancelled")}</Badge>
                  )}
                  {!match.isConfirmed &&
                    !match.isForfeited &&
                    !match.isCancelled && (
                      <span className="text-sm text-muted-foreground">
                        {t("matchDetail.status.noFlags")}
                      </span>
                    )}
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    {t("matchDetail.status.lastSync", {
                      value: match.lastRemoteSync
                        ? new Date(match.lastRemoteSync).toLocaleString("de-DE")
                        : "\u2014",
                    })}
                  </div>
                  <div>{t("matchDetail.status.remoteVersion", { version: match.currentRemoteVersion })}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Editable form */}
          <div className="space-y-6">
            {/* Overridable fields */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("matchDetail.overrides.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MatchOverrideField
                  control={form.control}
                  name="kickoffDate"
                  label={t("matchDetail.overrides.date")}
                  remoteValue={match.kickoffDate}
                  diffStatus={getDiffStatus("kickoffDate")}
                  inputType="date"
                  isOverridden={match.overriddenFields.includes("kickoffDate")}
                  onRelease={() => handleReleaseOverride("kickoffDate")}
                />
                <MatchOverrideField
                  control={form.control}
                  name="kickoffTime"
                  label={t("matchDetail.overrides.time")}
                  remoteValue={formatMatchTime(match.kickoffTime)}
                  diffStatus={getDiffStatus("kickoffTime")}
                  inputType="time"
                  isOverridden={match.overriddenFields.includes("kickoffTime")}
                  onRelease={() => handleReleaseOverride("kickoffTime")}
                />
                <MatchOverrideField
                  control={form.control}
                  name="venueNameOverride"
                  label={t("matchDetail.overrides.venue")}
                  remoteValue={match.venueName}
                  diffStatus={getDiffStatus("venue")}
                  inputType="text"
                />
                <MatchOverrideField
                  control={form.control}
                  name="isForfeited"
                  label={t("matchDetail.overrides.forfeited")}
                  remoteValue={String(match.isForfeited ?? false)}
                  diffStatus={getDiffStatus("isForfeited")}
                  inputType="boolean"
                  isOverridden={match.overriddenFields.includes("isForfeited")}
                  onRelease={() => handleReleaseOverride("isForfeited")}
                />
                <MatchOverrideField
                  control={form.control}
                  name="isCancelled"
                  label={t("matchDetail.overrides.cancelled")}
                  remoteValue={String(match.isCancelled ?? false)}
                  diffStatus={getDiffStatus("isCancelled")}
                  inputType="boolean"
                  isOverridden={match.overriddenFields.includes("isCancelled")}
                  onRelease={() => handleReleaseOverride("isCancelled")}
                />
              </CardContent>
            </Card>

            {/* Staff (local-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("matchDetail.staff.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Controller
                  control={form.control}
                  name="anschreiber"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="anschreiber">
                        {t("matchDetail.staff.anschreiber")}
                      </FieldLabel>
                      <Input
                        id="anschreiber"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder={t("matchDetail.staff.placeholder")}
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
                      <FieldLabel htmlFor="zeitnehmer">
                        {t("matchDetail.staff.zeitnehmer")}
                      </FieldLabel>
                      <Input
                        id="zeitnehmer"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder={t("matchDetail.staff.placeholder")}
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
                      <FieldLabel htmlFor="shotclock">
                        {t("matchDetail.staff.shotclock")}
                      </FieldLabel>
                      <Input
                        id="shotclock"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder={t("matchDetail.staff.placeholder")}
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
              </CardContent>
            </Card>

            {/* Notes (local-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("matchDetail.notes.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Controller
                  control={form.control}
                  name="internalNotes"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="internal-notes">
                        {t("matchDetail.notes.internal")}
                      </FieldLabel>
                      <FieldDescription>
                        {t("matchDetail.notes.internalDescription")}
                      </FieldDescription>
                      <Textarea
                        id="internal-notes"
                        rows={4}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder={t("matchDetail.notes.internalPlaceholder")}
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
                      <FieldLabel htmlFor="public-comment">
                        {t("matchDetail.notes.public")}
                      </FieldLabel>
                      <FieldDescription>
                        {t("matchDetail.notes.publicDescription")}
                      </FieldDescription>
                      <Textarea
                        id="public-comment"
                        rows={3}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder={t("matchDetail.notes.publicPlaceholder")}
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
              </CardContent>
            </Card>

            {/* Form footer */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <Controller
                    control={form.control}
                    name="changeReason"
                    render={({ field, fieldState }) => (
                      <Field>
                        <FieldLabel htmlFor="change-reason">
                          {t("matchDetail.changeReason.label")}
                        </FieldLabel>
                        <FieldDescription>
                          {t("matchDetail.changeReason.description")}
                        </FieldDescription>
                        <Input
                          id="change-reason"
                          placeholder={t("matchDetail.changeReason.placeholder")}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
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
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
