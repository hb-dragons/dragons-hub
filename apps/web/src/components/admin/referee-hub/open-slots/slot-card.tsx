"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { cn } from "@dragons/ui/lib/utils";
import { CandidatePicker } from "./candidate-picker";

type SlotStatus = "open" | "offered" | "assigned";

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

/**
 * One of our referee slots in the game sheet. An unfilled slot lists its
 * candidates inline: the sheet has the room, and a popover inside a sheet hid
 * the list behind one more click.
 */
export function SlotCard({ gameApiId, slotNumber, assignment, onChange }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const assigned = assignment.status === "assigned";

  return (
    <section className="bg-surface-low space-y-3 rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("slot.label", { n: String(slotNumber) })}
        </h3>
        {assigned ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              void run(() => api.referees.unassignReferee(gameApiId, slotNumber), t("slot.unassignFailed"));
            }}
          >
            {t("slot.unassign")}
          </Button>
        ) : (
          <span
            className={cn(
              "rounded-4xl px-2 py-0.5 text-xs font-medium",
              assignment.status === "open" ? "bg-heat/15 text-heat" : "bg-muted text-muted-foreground",
            )}
          >
            {t(assignment.status === "open" ? "slot.open" : "slot.offered")}
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive flex items-center justify-between rounded-md px-2 py-1 text-xs"
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            {t("errorChip.dismiss")}
          </Button>
        </div>
      )}

      {assigned ? (
        <p className="text-sm font-semibold">{assignment.refereeName ?? "—"}</p>
      ) : (
        <CandidatePicker
          gameApiId={gameApiId}
          slotNumber={slotNumber}
          disabled={busy}
          onPick={(refereeApiId) => {
            void run(
              () => api.referees.assignReferee(gameApiId, { slotNumber, refereeApiId }),
              t("slot.assignFailed"),
            );
          }}
        />
      )}
    </section>
  );
}
