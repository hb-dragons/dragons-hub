"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@dragons/ui/components/dialog";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { fetchAPI, APIError } from "@/lib/api";
import { apiFetcher } from "@/lib/swr";
import { toast } from "sonner";
import type {
  RefereeGameListItem,
  CandidateSearchResponse,
  AssignRefereeResponse,
} from "@dragons/shared";

type RefCandidate = CandidateSearchResponse["results"][number];

interface AssignRefereeDialogProps {
  open: boolean;
  game: RefereeGameListItem | null;
  slotNumber: 1 | 2;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignRefereeDialog({
  open,
  game,
  slotNumber,
  onClose,
  onSuccess,
}: AssignRefereeDialogProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RefCandidate | null>(null);
  const [loading, setLoading] = useState(false);

  const candidatesKey =
    open && game
      ? `/admin/referee/games/${game.apiMatchId}/candidates?slotNumber=${slotNumber}&search=${encodeURIComponent(search)}&pageFrom=0&pageSize=15`
      : null;

  const { data } = useSWR<CandidateSearchResponse>(candidatesKey, apiFetcher);

  const slotLabel = slotNumber === 1 ? "SR1" : "SR2";

  function handleClose() {
    setSearch("");
    setSelected(null);
    onClose();
  }

  async function handleConfirm() {
    if (!game || !selected) return;
    setLoading(true);
    try {
      await fetchAPI<AssignRefereeResponse>(
        `/admin/referee/games/${game.apiMatchId}/assign`,
        {
          method: "POST",
          body: JSON.stringify({ slotNumber, refereeApiId: selected.srId }),
        },
      );
      handleClose();
      onSuccess();
      toast.success("Referee assigned", {
        description: `${selected.vorname} ${selected.nachName} assigned as ${slotLabel}.`,
      });
    } catch (error) {
      const message =
        error instanceof APIError ? error.message : "Assignment failed. Please try again.";
      toast.error("Assignment failed", { description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign {slotLabel}</DialogTitle>
          {game && (
            <DialogDescription>
              {game.homeTeamName} vs. {game.guestTeamName} — {game.kickoffDate}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(null);
            }}
            autoFocus
          />

          <div className="max-h-64 overflow-y-auto space-y-1">
            {data?.results.map((candidate) => (
              <button
                key={candidate.srId}
                type="button"
                onClick={() => setSelected(candidate)}
                className={`w-full text-left rounded px-3 py-2 text-sm transition-colors ${
                  selected?.srId === candidate.srId
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                }`}
              >
                <span className="font-medium">
                  {candidate.vorname} {candidate.nachName}
                </span>
                {candidate.distanceKm && (
                  <span className="ml-2 text-muted-foreground">{candidate.distanceKm} km</span>
                )}
                {candidate.warning.length > 0 && (
                  <span className="ml-2 text-destructive text-xs">⚠ {candidate.warning[0]}</span>
                )}
              </button>
            ))}
            {data && data.results.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-4 text-center">
                No qualified referees found
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || loading}>
            {loading ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
