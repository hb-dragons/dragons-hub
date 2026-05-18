"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { fetchAPI, APIError } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { CandidatePicker } from "./candidate-picker";

export type SlotStatus = "open" | "offered" | "assigned";

interface Assignment {
  refereeApiId: number | null;
  refereeName: string | null;
  status: SlotStatus;
}

interface Props {
  gameApiId: number;
  slotNumber: 1 | 2;
  assignment: Assignment;
  onChange: () => void;
}

export function SlotCard({ gameApiId, slotNumber, assignment, onChange }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const [busy, setBusy] = useState(false);

  async function handleAssign(refereeApiId: number) {
    setBusy(true);
    try {
      await fetchAPI(`/admin/referee/games/${gameApiId}/assign`, {
        method: "POST",
        body: JSON.stringify({ slotNumber, refereeApiId }),
      });
      toast.success(t("toast.assigned"));
      onChange();
    } catch (err) {
      const msg = err instanceof APIError ? err.message : t("toast.assignFailed");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign() {
    setBusy(true);
    try {
      await fetchAPI(`/admin/referee/games/${gameApiId}/assignment/${slotNumber}`, {
        method: "DELETE",
      });
      toast.success(t("toast.unassigned"));
      onChange();
    } catch (err) {
      const msg = err instanceof APIError ? err.message : t("toast.unassignFailed");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const isOpen = assignment.status === "open";

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-muted-foreground">
            {t("slot.label", { n: String(slotNumber) })}
          </div>
          {isOpen ? (
            <div className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {t("slot.open")}
            </div>
          ) : (
            <div className="text-sm font-semibold">{assignment.refereeName ?? "—"}</div>
          )}
        </div>
        {!isOpen && (
          <Button variant="outline" size="sm" disabled={busy} onClick={handleUnassign}>
            {t("slot.unassign")}
          </Button>
        )}
      </div>
      {isOpen && (
        <CandidatePicker
          gameApiId={gameApiId}
          slotNumber={slotNumber}
          onPick={handleAssign}
          disabled={busy}
        />
      )}
    </div>
  );
}
