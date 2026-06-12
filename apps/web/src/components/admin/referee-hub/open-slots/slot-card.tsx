"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, APIError } from "@/lib/api";
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
  const [error, setError] = useState<string | null>(null);

  async function handleAssign(refereeApiId: number) {
    setBusy(true);
    setError(null);
    try {
      await api.referees.assignReferee(gameApiId, { slotNumber, refereeApiId });
      onChange();
    } catch (err) {
      setError(err instanceof APIError ? err.message : err instanceof Error ? err.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign() {
    setBusy(true);
    setError(null);
    try {
      await api.referees.unassignReferee(gameApiId, slotNumber);
      onChange();
    } catch (err) {
      setError(err instanceof APIError ? err.message : err instanceof Error ? err.message : "Unassign failed");
    } finally {
      setBusy(false);
    }
  }

  const isOpen = assignment.status === "open";

  return (
    <div className="bg-surface-low rounded-md p-3 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-muted-foreground">{t("slot.label", { n: String(slotNumber) })}</div>
          {isOpen ? (
            <div className="text-sm font-semibold text-heat">{t("slot.open")}</div>
          ) : (
            <div className="text-sm font-semibold">{assignment.refereeName ?? "—"}</div>
          )}
        </div>
        {!isOpen && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { void handleUnassign(); }}>{t("slot.unassign")}</Button>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between text-xs rounded-md bg-destructive/10 text-destructive px-2 py-1">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>{t("errorChip.dismiss")}</Button>
        </div>
      )}

      {isOpen && (
        <CandidatePicker
          gameApiId={gameApiId}
          slotNumber={slotNumber}
          onPick={(id) => { void handleAssign(id); }}
          disabled={busy}
        />
      )}
    </div>
  );
}
