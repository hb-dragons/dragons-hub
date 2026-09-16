"use client";

import { useId, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { queries } from "@/lib/swr-queries";
import { clubDayAnchor, clubTimeAnchor } from "@dragons/shared";
import type { HallTimeKind, HallTimeRow, VenueListItem } from "@dragons/shared";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@dragons/ui/components/sheet";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { DatePicker } from "@dragons/ui/components/date-picker";
import { TimePicker } from "@dragons/ui/components/time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

interface VenueHallTimesSheetProps {
  venue: VenueListItem;
  canEdit: boolean;
}

/** Rows grouped by `YYYY-MM`, in calendar order; the API already sorts by date. */
function byMonth(rows: HallTimeRow[]): [string, HallTimeRow[]][] {
  const groups = new Map<string, HallTimeRow[]>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const list = groups.get(month) ?? [];
    list.push(row);
    groups.set(month, list);
  }
  return [...groups];
}

/**
 * The hall times the club holds at one venue: what the Anlage T import wrote,
 * plus whatever was entered by hand. A day can be added, replaced or removed
 * here; the sheet import replaces sheet rows inside its span wholesale.
 */
export function VenueHallTimesSheet({ venue, canEdit }: VenueHallTimesSheetProps) {
  const t = useTranslations("hallTimes");
  const format = useFormatter();
  const ids = useId();
  const q = queries.venueHallTimes(venue.id);
  const { data, error, isLoading, mutate } = useSWR(q.key, q.fetcher);

  const [date, setDate] = useState<string | null>(null);
  const [kind, setKind] = useState<HallTimeKind>("open");
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const months = useMemo(() => byMonth(data ?? []), [data]);
  const canSave =
    date !== null && (kind === "closed" || (startTime !== null && endTime !== null && startTime < endTime));

  async function save() {
    if (!date || !canSave) return;
    setSaving(true);
    try {
      await api.venues.upsertHallTime(venue.id, date, {
        kind,
        startTime: kind === "open" ? startTime : null,
        endTime: kind === "open" ? endTime : null,
        note: note.trim() || null,
      });
      toast.success(t("edit.saved"));
      setDate(null);
      setNote("");
      await mutate();
    } catch {
      toast.error(t("import.failed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: HallTimeRow) {
    setDeleting(row.date);
    try {
      await api.venues.deleteHallTime(venue.id, row.date);
      toast.success(t("edit.deleted"));
      await mutate();
    } catch {
      toast.error(t("import.failed"));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <SheetContent className="flex w-full flex-col sm:max-w-lg">
      <SheetHeader>
        <SheetTitle>{venue.name}</SheetTitle>
        <SheetDescription>{t("description")}</SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {canEdit && (
          <form
            className="space-y-3 rounded-md bg-surface-low p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t("edit.add")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`${ids}-date`}>{t("edit.date")}</Label>
                <DatePicker id={`${ids}-date`} value={date} onChange={setDate} className="h-9 w-full" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${ids}-kind`}>{t("edit.kind")}</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as HallTimeKind)}>
                  <SelectTrigger id={`${ids}-kind`} className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">{t("kind.open")}</SelectItem>
                    <SelectItem value="closed">{t("kind.closed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {kind === "open" && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor={`${ids}-start`}>{t("edit.startTime")}</Label>
                    <TimePicker id={`${ids}-start`} value={startTime} onChange={setStartTime} className="h-9 w-full" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${ids}-end`}>{t("edit.endTime")}</Label>
                    <TimePicker id={`${ids}-end`} value={endTime} onChange={setEndTime} className="h-9 w-full" />
                  </div>
                </>
              )}
              <div className="col-span-2 space-y-1">
                <Label htmlFor={`${ids}-note`}>{t("edit.note")}</Label>
                <Input id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={!canSave || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {t("edit.save")}
            </Button>
          </form>
        )}

        {error && (
          <ErrorState
            onRetry={() => {
              void mutate();
            }}
          />
        )}
        {isLoading && !data && <LoadingState rows={4} />}
        {data && data.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">{t("empty")}</p>
        )}
        {months.map(([month, rows]) => (
          <section key={month} className="space-y-1">
            <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {format.dateTime(clubDayAnchor(`${month}-01`), { month: "long", year: "numeric" })}
            </h4>
            <ul className="space-y-0.5">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 rounded-md bg-surface-low px-2 py-1.5 text-sm" data-testid="hall-time-row">
                  <span className="w-28 shrink-0 tabular-nums">
                    {format.dateTime(clubDayAnchor(row.date), "matchDate")}
                  </span>
                  {row.kind === "open" && row.startTime && row.endTime ? (
                    <span className="tabular-nums">
                      {format.dateTime(clubTimeAnchor(row.startTime, row.date), "matchTime")}
                      {" – "}
                      {format.dateTime(clubTimeAnchor(row.endTime, row.date), "matchTime")}
                    </span>
                  ) : (
                    <Badge variant="secondary">{t("kind.closed")}</Badge>
                  )}
                  {row.note && <span className="text-muted-foreground truncate text-xs">{row.note}</span>}
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {t(`source.${row.source}`)}
                  </Badge>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t("edit.delete")} ${row.date}`}
                      disabled={deleting === row.date}
                      onClick={() => {
                        void remove(row);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </SheetContent>
  );
}
