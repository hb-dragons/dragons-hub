"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dragons/ui/components/tabs";
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
import { DiffIndicator } from "./diff-indicator";
import { formatMatchDate, formatMatchTime, formatScore, formatPeriodScores } from "./utils";
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
    kickoffDate: match.overriddenFields.includes("kickoffDate") ? match.kickoffDate : null,
    kickoffTime: match.overriddenFields.includes("kickoffTime") ? match.kickoffTime : null,
    venueNameOverride: match.venueNameOverride,
    isForfeited: match.overriddenFields.includes("isForfeited") ? match.isForfeited : null,
    isCancelled: match.overriddenFields.includes("isCancelled") ? match.isCancelled : null,
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
  });

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
        toast.success("Match updated");
        router.refresh();
      } catch {
        toast.error("Failed to update match");
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
        toast.success(`Override for ${fieldName} released`);
        router.refresh();
      } catch {
        toast.error("Failed to release override");
      } finally {
        setSaving(false);
      }
    },
    [match.id, form, router],
  );

  const periodScores = formatPeriodScores(match);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/matches">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {match.homeTeamName} vs {match.guestTeamName}
          </h1>
          <p className="text-muted-foreground">
            {formatMatchDate(match.kickoffDate)} &middot;{" "}
            {formatMatchTime(match.kickoffTime)} &middot; Matchday{" "}
            {match.matchDay}
          </p>
        </div>
        {match.hasLocalChanges && (
          <Badge variant="outline" className="border-amber-500 text-amber-600">
            Local Changes (v{match.currentLocalVersion})
          </Badge>
        )}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Match Info</TabsTrigger>
            <TabsTrigger value="overrides">Edit Overrides</TabsTrigger>
            <TabsTrigger value="kampfgericht">Kampfgericht</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          {/* Match Info Tab */}
          <TabsContent value="info" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Match Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Match No:</span>{" "}
                    {match.matchNo}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Matchday:</span>{" "}
                    {match.matchDay}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date:</span>{" "}
                    {formatMatchDate(match.kickoffDate)}
                    {getDiffStatus("kickoffDate") && (
                      <span className="ml-2">
                        <DiffIndicator
                          status={getDiffStatus("kickoffDate")!}
                        />
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time:</span>{" "}
                    {formatMatchTime(match.kickoffTime)}
                    {getDiffStatus("kickoffTime") && (
                      <span className="ml-2">
                        <DiffIndicator
                          status={getDiffStatus("kickoffTime")!}
                        />
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Venue:</span>{" "}
                    {match.venueNameOverride ?? match.venueName ?? "—"}
                    {getDiffStatus("venue") && (
                      <span className="ml-2">
                        <DiffIndicator status={getDiffStatus("venue")!} />
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">League:</span>{" "}
                    {match.leagueName ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Score:</span>{" "}
                    {formatScore(match.homeScore, match.guestScore)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Halftime:</span>{" "}
                    {formatScore(
                      match.homeHalftimeScore,
                      match.guestHalftimeScore,
                    )}
                  </div>
                </div>

                {/* Period Scores Box Score */}
                {periodScores.length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                      Period Scores (per-period)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-auto border-collapse text-sm">
                        <thead>
                          <tr>
                            <th className="px-3 py-1 text-left font-medium text-muted-foreground" />
                            {periodScores.map((p) => (
                              <th key={p.label} className="px-3 py-1 text-center font-medium text-muted-foreground">
                                {p.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-3 py-1 font-medium">{match.homeTeamName}</td>
                            {periodScores.map((p) => (
                              <td key={p.label} className="px-3 py-1 text-center tabular-nums">
                                {p.home ?? "—"}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="px-3 py-1 font-medium">{match.guestTeamName}</td>
                            {periodScores.map((p) => (
                              <td key={p.label} className="px-3 py-1 text-center tabular-nums">
                                {p.guest ?? "—"}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {match.venueNameOverride && (
                  <div className="rounded-md bg-amber-50 p-3 text-sm">
                    <span className="font-medium text-amber-800">
                      Local venue:
                    </span>{" "}
                    <span className="text-amber-700">
                      {match.venueNameOverride}
                    </span>
                  </div>
                )}

                {/* Active overrides summary */}
                {match.overrides.length > 0 && (
                  <div className="rounded-md bg-amber-50 p-3 text-sm">
                    <span className="font-medium text-amber-800">
                      Active overrides:
                    </span>{" "}
                    <span className="text-amber-700">
                      {match.overrides.map((o) => o.fieldName).join(", ")}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Edit Overrides Tab */}
          <TabsContent value="overrides" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Local Overrides</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-[150px_1fr_1fr_auto_auto] items-center gap-4 text-xs font-medium text-muted-foreground">
                  <div>Field</div>
                  <div>Remote</div>
                  <div>Local Override</div>
                  <div className="w-20">Status</div>
                  <div className="w-8" />
                </div>

                <MatchOverrideField
                  control={form.control}
                  name="kickoffDate"
                  label="Date"
                  remoteValue={match.kickoffDate}
                  diffStatus={getDiffStatus("kickoffDate")}
                  inputType="date"
                  isOverridden={match.overriddenFields.includes("kickoffDate")}
                  onRelease={() => handleReleaseOverride("kickoffDate")}
                />

                <MatchOverrideField
                  control={form.control}
                  name="kickoffTime"
                  label="Time"
                  remoteValue={formatMatchTime(match.kickoffTime)}
                  diffStatus={getDiffStatus("kickoffTime")}
                  inputType="time"
                  isOverridden={match.overriddenFields.includes("kickoffTime")}
                  onRelease={() => handleReleaseOverride("kickoffTime")}
                />

                <MatchOverrideField
                  control={form.control}
                  name="venueNameOverride"
                  label="Venue"
                  remoteValue={match.venueName}
                  diffStatus={getDiffStatus("venue")}
                  inputType="text"
                />

                <MatchOverrideField
                  control={form.control}
                  name="isForfeited"
                  label="Forfeited"
                  remoteValue={String(match.isForfeited ?? false)}
                  diffStatus={getDiffStatus("isForfeited")}
                  inputType="boolean"
                  isOverridden={match.overriddenFields.includes("isForfeited")}
                  onRelease={() => handleReleaseOverride("isForfeited")}
                />

                <MatchOverrideField
                  control={form.control}
                  name="isCancelled"
                  label="Cancelled"
                  remoteValue={String(match.isCancelled ?? false)}
                  diffStatus={getDiffStatus("isCancelled")}
                  inputType="boolean"
                  isOverridden={match.overriddenFields.includes("isCancelled")}
                  onRelease={() => handleReleaseOverride("isCancelled")}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Kampfgericht Tab */}
          <TabsContent value="kampfgericht" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Court Officials</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Controller
                  control={form.control}
                  name="anschreiber"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="anschreiber">
                        Anschreiber
                      </FieldLabel>
                      <FieldDescription>
                        Scorekeeper for the match
                      </FieldDescription>
                      <Input
                        id="anschreiber"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Name"
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
                        Zeitnehmer
                      </FieldLabel>
                      <FieldDescription>
                        Timekeeper for the match
                      </FieldDescription>
                      <Input
                        id="zeitnehmer"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Name"
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
                        Shotclock Operator
                      </FieldLabel>
                      <FieldDescription>
                        24-second clock operator
                      </FieldDescription>
                      <Input
                        id="shotclock"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Name"
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Controller
                  control={form.control}
                  name="internalNotes"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="internal-notes">
                        Internal Notes
                      </FieldLabel>
                      <FieldDescription>
                        Only visible to admins, not shown publicly
                      </FieldDescription>
                      <Textarea
                        id="internal-notes"
                        rows={4}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Internal notes (not visible externally)"
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
                        Public Comment
                      </FieldLabel>
                      <FieldDescription>
                        Shown on the public match page
                      </FieldDescription>
                      <Textarea
                        id="public-comment"
                        rows={3}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Public comment"
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer with change reason and save button */}
        <Separator className="my-6" />

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <Controller
              control={form.control}
              name="changeReason"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="change-reason">
                    Change Reason
                  </FieldLabel>
                  <FieldDescription>
                    Optional note explaining why this change was made
                  </FieldDescription>
                  <Input
                    id="change-reason"
                    placeholder="e.g. Rescheduled by email"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </Field>
              )}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
