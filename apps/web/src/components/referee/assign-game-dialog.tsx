"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@dragons/ui/components/dialog";
import { Button } from "@dragons/ui/components/button";
import { toast } from "sonner";
import { fetchAPI, APIError } from "@/lib/api";
import type { RefereeGameListItem, AssignRefereeResponse } from "@dragons/shared";

interface AssignGameDialogProps {
  open: boolean;
  game: RefereeGameListItem | null;
  slotNumber: 1 | 2;
  refereeApiId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignGameDialog({
  open,
  game,
  slotNumber,
  refereeApiId,
  onClose,
  onSuccess,
}: AssignGameDialogProps) {
  const [loading, setLoading] = useState(false);

  if (!game) return null;

  const slotLabel = slotNumber === 1 ? "SR1" : "SR2";

  async function handleConfirm() {
    if (!game) return;
    setLoading(true);
    try {
      await fetchAPI<AssignRefereeResponse>(
        `/referee/games/${game.apiMatchId}/assign`,
        {
          method: "POST",
          body: JSON.stringify({ slotNumber, refereeApiId }),
        },
      );
      onSuccess();
      onClose();
      toast.success("Assignment confirmed", { description: `You are assigned as ${slotLabel}.` });
    } catch (error) {
      const message =
        error instanceof APIError ? error.message : "Assignment failed. Please try again.";
      toast.error("Assignment failed", { description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take {slotLabel}</DialogTitle>
          <DialogDescription>
            {game.homeTeamName} vs. {game.guestTeamName}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm space-y-2 py-2">
          <p>
            <span className="text-muted-foreground">Date:</span>{" "}
            {game.kickoffDate} {game.kickoffTime?.slice(0, 5)}
          </p>
          {game.venueName && (
            <p>
              <span className="text-muted-foreground">Venue:</span> {game.venueName}
              {game.venueCity ? `, ${game.venueCity}` : ""}
            </p>
          )}
          <p className="text-muted-foreground mt-3">
            By continuing, this assignment will be officially submitted to the federation.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Submitting…" : "Take game"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
