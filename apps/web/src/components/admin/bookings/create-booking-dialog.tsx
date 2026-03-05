"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@dragons/ui/components/dialog";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Textarea } from "@dragons/ui/components/textarea";
import { Label } from "@dragons/ui/components/label";
import { Combobox } from "@dragons/ui/components/combobox";
import type { ComboboxOption } from "@dragons/ui/components/combobox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface VenueListItem {
  id: number;
  name: string;
  city: string | null;
}

interface CreateBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateBookingDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateBookingDialogProps) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const { data: venues } = useSWR<VenueListItem[]>(
    open ? SWR_KEYS.venues : null,
    apiFetcher,
  );

  const [venueId, setVenueId] = useState<number | null>(null);
  const [venueQuery, setVenueQuery] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setVenueId(null);
    setVenueQuery("");
    setDate("");
    setStartTime("");
    setEndTime("");
    setNotes("");
    setOverrideReason("");
  }

  const handleSearchVenues = useCallback(
    async (query: string): Promise<ComboboxOption[]> => {
      if (!venues) return [];
      const lower = query.toLowerCase();
      return venues
        .filter(
          (v) =>
            v.name.toLowerCase().includes(lower) ||
            (v.city && v.city.toLowerCase().includes(lower)),
        )
        .slice(0, 20)
        .map((v) => ({
          value: String(v.id),
          label: v.name,
          description: v.city ?? undefined,
        }));
    },
    [venues],
  );

  function handleSelectVenue(option: ComboboxOption) {
    setVenueId(Number(option.value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!venueId || !date || !startTime || !endTime) return;

    setSubmitting(true);
    try {
      await fetchAPI("/admin/bookings", {
        method: "POST",
        body: JSON.stringify({
          venueId,
          date,
          overrideStartTime: startTime,
          overrideEndTime: endTime,
          overrideReason: overrideReason || undefined,
          notes: notes || undefined,
        }),
      });
      await mutate(SWR_KEYS.bookings);
      toast.success(t("bookings.toast.created"));
      resetForm();
      onCreated();
      onOpenChange(false);
    } catch {
      toast.error(t("common.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = venueId !== null && date && startTime && endTime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("bookings.create.title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("bookings.create.venue")}</Label>
            <Combobox
              value={venueQuery}
              onChange={setVenueQuery}
              onSearch={handleSearchVenues}
              onSelect={handleSelectVenue}
              placeholder={t("bookings.create.venuePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-booking-date">
              {t("bookings.create.date")}
            </Label>
            <Input
              id="create-booking-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="create-booking-start">
                {t("bookings.create.startTime")}
              </Label>
              <Input
                id="create-booking-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-booking-end">
                {t("bookings.create.endTime")}
              </Label>
              <Input
                id="create-booking-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-booking-notes">
              {t("bookings.create.notes")}
            </Label>
            <Textarea
              id="create-booking-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("bookings.create.notesPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-booking-reason">
              {t("bookings.override.reason")}
            </Label>
            <Input
              id="create-booking-reason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("bookings.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
