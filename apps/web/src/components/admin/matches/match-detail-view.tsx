"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import Link from "next/link";
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
import { matchStrings } from "./match-strings";

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
        toast.success(matchStrings.saveSuccess);
        router.refresh();
      } catch {
        toast.error(matchStrings.saveError);
      } finally {
        setSaving(false);
      }
    },
    [match.id, form, router],
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
        toast.success(matchStrings.releaseSuccess);
        router.refresh();
      } catch {
        toast.error(matchStrings.releaseError);
      } finally {
        setSaving(false);
      }
    },
    [match.id, form, router],
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
            Zurück
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {match.homeTeamName} vs {match.guestTeamName}
          </h1>
          <p className="text-muted-foreground">{matchStrings.matchDay} {match.matchDay}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">MD {match.matchDay}</Badge>
          {overrideCount > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500 text-amber-600"
            >
              {matchStrings.overrideCount(overrideCount)}
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
                <CardTitle className="text-base">{matchStrings.sectionMatchInfo}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{matchStrings.matchNo}</dt>
                    <dd className="font-medium">{match.matchNo}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{matchStrings.matchDay}</dt>
                    <dd className="font-medium">{match.matchDay}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{matchStrings.league}</dt>
                    <dd className="font-medium">
                      {match.leagueName ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{matchStrings.columnDate}</dt>
                    <dd className="font-medium">
                      {formatMatchDate(match.kickoffDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{matchStrings.columnTime}</dt>
                    <dd className="font-medium">
                      {formatMatchTime(match.kickoffTime)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{matchStrings.venue}</dt>
                    <dd className="font-medium">
                      {match.venueNameOverride ?? match.venueName ?? "—"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{matchStrings.score}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{matchStrings.score}</dt>
                    <dd className="text-lg font-bold tabular-nums">
                      {formatScore(match.homeScore, match.guestScore)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{matchStrings.halftimeScore}</dt>
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
                              {p.home ?? "—"}
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
                              {p.guest ?? "—"}
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
                <CardTitle className="text-base">{matchStrings.status}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {match.isConfirmed && (
                    <Badge variant="success">{matchStrings.confirmed}</Badge>
                  )}
                  {match.isForfeited && (
                    <Badge variant="destructive">{matchStrings.forfeited}</Badge>
                  )}
                  {match.isCancelled && (
                    <Badge variant="destructive">{matchStrings.cancelled}</Badge>
                  )}
                  {!match.isConfirmed &&
                    !match.isForfeited &&
                    !match.isCancelled && (
                      <span className="text-sm text-muted-foreground">
                        {matchStrings.noStatusFlags}
                      </span>
                    )}
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    {matchStrings.lastSync}:{" "}
                    {match.lastRemoteSync
                      ? new Date(match.lastRemoteSync).toLocaleString("de-DE")
                      : "—"}
                  </div>
                  <div>{matchStrings.remoteVersion}: v{match.currentRemoteVersion}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Editable form */}
          <div className="space-y-6">
            {/* Overridable fields */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{matchStrings.sectionOverrides}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MatchOverrideField
                  control={form.control}
                  name="kickoffDate"
                  label={matchStrings.columnDate}
                  remoteValue={match.kickoffDate}
                  diffStatus={getDiffStatus("kickoffDate")}
                  inputType="date"
                  isOverridden={match.overriddenFields.includes("kickoffDate")}
                  onRelease={() => handleReleaseOverride("kickoffDate")}
                />
                <MatchOverrideField
                  control={form.control}
                  name="kickoffTime"
                  label={matchStrings.columnTime}
                  remoteValue={formatMatchTime(match.kickoffTime)}
                  diffStatus={getDiffStatus("kickoffTime")}
                  inputType="time"
                  isOverridden={match.overriddenFields.includes("kickoffTime")}
                  onRelease={() => handleReleaseOverride("kickoffTime")}
                />
                <MatchOverrideField
                  control={form.control}
                  name="venueNameOverride"
                  label={matchStrings.venueOverride}
                  remoteValue={match.venueName}
                  diffStatus={getDiffStatus("venue")}
                  inputType="text"
                />
                <MatchOverrideField
                  control={form.control}
                  name="isForfeited"
                  label={matchStrings.forfeited}
                  remoteValue={String(match.isForfeited ?? false)}
                  diffStatus={getDiffStatus("isForfeited")}
                  inputType="boolean"
                  isOverridden={match.overriddenFields.includes("isForfeited")}
                  onRelease={() => handleReleaseOverride("isForfeited")}
                />
                <MatchOverrideField
                  control={form.control}
                  name="isCancelled"
                  label={matchStrings.cancelled}
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
                <CardTitle className="text-base">{matchStrings.sectionStaff}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Controller
                  control={form.control}
                  name="anschreiber"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="anschreiber">
                        {matchStrings.columnAnschreiber}
                      </FieldLabel>
                      <Input
                        id="anschreiber"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Teamname"
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
                        {matchStrings.columnZeitnehmer}
                      </FieldLabel>
                      <Input
                        id="zeitnehmer"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Teamname"
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
                        {matchStrings.columnShotclock}
                      </FieldLabel>
                      <Input
                        id="shotclock"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Teamname"
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
                <CardTitle className="text-base">{matchStrings.sectionNotes}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Controller
                  control={form.control}
                  name="internalNotes"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="internal-notes">
                        {matchStrings.internalNotes}
                      </FieldLabel>
                      <FieldDescription>
                        {matchStrings.internalNotesHint}
                      </FieldDescription>
                      <Textarea
                        id="internal-notes"
                        rows={4}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder={matchStrings.internalNotes}
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
                        {matchStrings.publicComment}
                      </FieldLabel>
                      <FieldDescription>
                        {matchStrings.publicCommentHint}
                      </FieldDescription>
                      <Textarea
                        id="public-comment"
                        rows={3}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder={matchStrings.publicComment}
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
                          {matchStrings.changeReason}
                        </FieldLabel>
                        <Input
                          id="change-reason"
                          placeholder={matchStrings.changeReasonPlaceholder}
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
                    {matchStrings.save}
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
