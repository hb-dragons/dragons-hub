"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@dragons/ui/components/popover";
import { Button } from "@dragons/ui/components/button";
import { fetchAPI, APIError } from "@/lib/api";
import { toast } from "sonner";
import type { UnassignRefereeResponse } from "@dragons/shared";

interface UnassignRefereeButtonProps {
  spielplanId: number;
  slotNumber: 1 | 2;
  refereeName: string;
  onSuccess: () => void;
}

export function UnassignRefereeButton({
  spielplanId,
  slotNumber,
  refereeName,
  onSuccess,
}: UnassignRefereeButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await fetchAPI<UnassignRefereeResponse>(
        `/admin/referee/games/${spielplanId}/assignment/${slotNumber}`,
        { method: "DELETE" },
      );
      setOpen(false);
      onSuccess();
      toast.success("Referee removed", { description: `${refereeName} unassigned.` });
    } catch (error) {
      const message =
        error instanceof APIError ? error.message : "Unassignment failed. Please try again.";
      toast.error("Unassignment failed", { description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive">
          Remove
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <p className="text-sm mb-3">
          Remove <strong>{refereeName}</strong>? This will be submitted to the federation.
        </p>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? "Removing…" : "Remove"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
