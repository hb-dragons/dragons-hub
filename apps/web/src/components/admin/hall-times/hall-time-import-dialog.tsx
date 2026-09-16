"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { resolveVenueId, type SelectedVenue } from "@/lib/venue-selection";
import { clubDayAnchor, parseAnlageT } from "@dragons/shared";
import type {
  AnlageTParseResult,
  HallTimeImportPreview,
  HallTimeInput,
  HallTimeRow,
  VenueListItem,
} from "@dragons/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Combobox, type ComboboxOption } from "@dragons/ui/components/combobox";
import { Separator } from "@dragons/ui/components/separator";
import { HallTimeCoverageBadge } from "./hall-time-coverage-badge";

interface HallTimeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venues: VenueListItem[];
  /** Called with the venue the sheet was imported for, once the API has applied it. */
  onImported: (venueId: number) => void;
}

/**
 * Reads the first worksheet of an .xlsx into the cell grid the shared parser
 * expects. `raw: false` hands over the cells as the sheet formats them — dates
 * as the file's own date format, times as HH:mm — which is what the parser is
 * tested against; the library is loaded on demand so the venue page does not
 * carry it until someone actually imports.
 */
async function readGrid(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const first = workbook.SheetNames[0];
  const sheet = first ? workbook.Sheets[first] : undefined;
  if (!sheet) throw new Error("empty workbook");
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null });
}

/** The venue whose name contains the sheet's hall name, or is contained in it. */
function guessVenue(hallName: string | null, venues: VenueListItem[]): VenueListItem | null {
  if (!hallName) return null;
  const wanted = hallName.trim().toLowerCase();
  if (!wanted) return null;
  return (
    venues.find((v) => {
      const name = v.name.toLowerCase();
      return name === wanted || name.includes(wanted) || wanted.includes(name);
    }) ?? null
  );
}

type Step =
  | { status: "idle" }
  | { status: "parsed"; result: AnlageTParseResult }
  | { status: "previewing"; result: AnlageTParseResult }
  | { status: "preview"; result: AnlageTParseResult; preview: HallTimeImportPreview };

function windowText(row: Pick<HallTimeInput, "kind" | "startTime" | "endTime" | "note">, closedLabel: string) {
  if (row.kind === "closed") return row.note ? `${closedLabel}: ${row.note}` : closedLabel;
  return `${row.startTime ?? ""} – ${row.endTime ?? ""}`;
}

export function HallTimeImportDialog({ open, onOpenChange, venues, onImported }: HallTimeImportDialogProps) {
  const t = useTranslations("hallTimes");
  const format = useFormatter();
  const ids = useId();
  const [step, setStep] = useState<Step>({ status: "idle" });
  const [selectedVenue, setSelectedVenue] = useState<SelectedVenue | null>(null);
  const [venueQuery, setVenueQuery] = useState("");
  const [applying, setApplying] = useState(false);
  const venueId = resolveVenueId(selectedVenue, venueQuery);

  useEffect(() => {
    if (!open) {
      setStep({ status: "idle" });
      setSelectedVenue(null);
      setVenueQuery("");
    }
  }, [open]);

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const result = parseAnlageT(await readGrid(file));
        setStep({ status: "parsed", result });
        const guess = guessVenue(result.hallName, venues);
        if (guess) {
          setSelectedVenue({ id: guess.id, label: guess.name });
          setVenueQuery(guess.name);
        }
      } catch {
        setStep({ status: "idle" });
        toast.error(t("import.parseFailed"));
      }
    },
    [venues, t],
  );

  const searchVenues = useCallback(
    async (query: string): Promise<ComboboxOption[]> => {
      const lower = query.toLowerCase();
      return venues
        .filter((v) => v.name.toLowerCase().includes(lower))
        .slice(0, 20)
        .map((v) => ({ value: String(v.id), label: v.name, description: v.city ?? undefined }));
    },
    [venues],
  );

  // A new file or another venue invalidates the preview: it was computed for the old pair.
  useEffect(() => {
    setStep((s) => (s.status === "preview" || s.status === "previewing" ? { status: "parsed", result: s.result } : s));
  }, [venueId]);

  const result = step.status === "idle" ? null : step.result;
  const body = result ? { rows: result.rows } : null;

  async function loadPreview() {
    if (!result || !body || venueId === null || result.rows.length === 0) return;
    setStep({ status: "previewing", result });
    try {
      const preview = await api.venues.previewHallTimeImport(venueId, body);
      setStep({ status: "preview", result, preview });
    } catch {
      setStep({ status: "parsed", result });
      toast.error(t("import.failed"));
    }
  }

  async function apply() {
    if (!body || venueId === null) return;
    setApplying(true);
    try {
      const applied = await api.venues.importHallTimes(venueId, body);
      toast.success(t("import.imported"));
      if (applied.eventsEmitted > 0) toast.info(t("import.applied", { count: applied.eventsEmitted }));
      onImported(venueId);
      onOpenChange(false);
    } catch {
      toast.error(t("import.failed"));
    } finally {
      setApplying(false);
    }
  }

  const preview = step.status === "preview" ? step.preview : null;
  const hasChanges =
    preview !== null && (preview.added.length > 0 || preview.changed.length > 0 || preview.removed.length > 0);
  const closedLabel = t("kind.closed");
  const day = (date: string) => format.dateTime(clubDayAnchor(date), "matchDate");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>{t("import.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${ids}-file`}>{t("import.file")}</Label>
            <Input
              id={`${ids}-file`}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
              }}
            />
          </div>

          {result && (
            <>
              <p className="text-sm" data-testid="import-parsed">
                {t("import.parsed", {
                  count: result.rows.length,
                  hallName: result.hallName ?? "?",
                  updatedOn: result.updatedOn ? day(result.updatedOn) : "none",
                })}
              </p>
              {result.warnings.length > 0 && (
                <div className="bg-heat/10 text-heat rounded-md p-3 text-xs">
                  <p className="font-medium">{t("import.warnings")}</p>
                  <ul className="mt-1 list-disc pl-4">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("import.venue")}</Label>
                <Combobox
                  value={venueQuery}
                  onChange={setVenueQuery}
                  onSearch={searchVenues}
                  onSelect={(option) => setSelectedVenue({ id: Number(option.value), label: option.label })}
                  placeholder={t("import.venuePlaceholder")}
                />
              </div>
            </>
          )}

          {preview && (
            <div className="space-y-3" data-testid="import-preview">
              <Separator />
              <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {t("import.preview")}
              </h4>
              {!hasChanges && <p className="text-muted-foreground text-sm">{t("import.noChanges")}</p>}
              <PreviewList title={t("import.added")} items={preview.added} day={day} closedLabel={closedLabel} />
              <PreviewList
                title={t("import.changed")}
                items={preview.changed.map((c) => c.after)}
                before={preview.changed.map((c) => c.before)}
                day={day}
                closedLabel={closedLabel}
              />
              <PreviewList title={t("import.removed")} items={preview.removed} day={day} closedLabel={closedLabel} />
              <p className="text-muted-foreground text-xs">{t("import.unchanged", { count: preview.unchanged })}</p>
              {preview.bookings.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("import.bookings")}</p>
                  <ul className="space-y-1 text-sm">
                    {preview.bookings.map((b) => (
                      <li key={b.bookingId} className="flex items-center gap-2">
                        <span className="tabular-nums">{day(b.date)}</span>
                        <HallTimeCoverageBadge coverage={b.before} className="text-[10px]" />
                        <span aria-hidden="true">→</span>
                        <HallTimeCoverageBadge coverage={b.after} className="text-[10px]" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!preview && (
            <Button
              onClick={() => {
                void loadPreview();
              }}
              disabled={!result || venueId === null || result.rows.length === 0 || step.status === "previewing"}
            >
              {step.status === "previewing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("import.preview")}
            </Button>
          )}
          {preview && hasChanges && (
            <Button
              onClick={() => {
                void apply();
              }}
              disabled={applying}
            >
              {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t("import.apply")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewList({
  title,
  items,
  before,
  day,
  closedLabel,
}: {
  title: string;
  items: (HallTimeInput | HallTimeRow)[];
  before?: HallTimeRow[];
  day: (date: string) => string;
  closedLabel: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        {title} <Badge variant="secondary">{items.length}</Badge>
      </p>
      <ul className="space-y-0.5 text-sm">
        {items.map((row, i) => (
          <li key={row.date} className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{day(row.date)}</span>
            {before?.[i] && (
              <>
                <span className="text-muted-foreground line-through">{windowText(before[i]!, closedLabel)}</span>
                <span aria-hidden="true">→</span>
              </>
            )}
            <span>{windowText(row, closedLabel)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
