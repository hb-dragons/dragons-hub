"use client";

import type { WizardState } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface CollapsedStepSummaryProps {
  step: 1 | 2 | 3;
  state: WizardState;
  onEdit: () => void;
}

function StepOneSummary({ state }: { state: WizardState }) {
  const typeLabel = state.postType === "results" ? "Ergebnisse" : "Vorschau";
  return (
    <span className="text-sm">
      <span className="font-medium">{typeLabel}</span>
      <span className="text-muted-foreground">
        {" · "}KW {state.calendarWeek} ({state.weekendLabel})
      </span>
    </span>
  );
}

function StepTwoSummary({ state }: { state: WizardState }) {
  const count = state.matches.length;
  const labels = state.matches.map((m) => m.teamLabel).join(", ");
  return (
    <span className="text-sm">
      <span className="font-medium">{count} Spiele</span>
      <span className="text-muted-foreground"> · {labels}</span>
    </span>
  );
}

function StepThreeSummary({ state }: { state: WizardState }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      {state.selectedPhotoId !== null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${API_BASE}/admin/social/player-photos/${state.selectedPhotoId}/image`}
          alt="Spielerfoto"
          className="h-10 w-10 rounded object-cover"
          crossOrigin="use-credentials"
        />
      )}
      {state.selectedBackground !== null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${API_BASE}/admin/social/backgrounds/${state.selectedBackground.id}/image`}
          alt="Hintergrund"
          className="h-10 w-10 rounded object-cover"
          crossOrigin="use-credentials"
        />
      )}
      <span className="text-muted-foreground">Foto & Hintergrund</span>
    </span>
  );
}

export function CollapsedStepSummary({
  step,
  state,
  onEdit,
}: CollapsedStepSummaryProps) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
          {step}
        </span>
        {step === 1 && <StepOneSummary state={state} />}
        {step === 2 && <StepTwoSummary state={state} />}
        {step === 3 && <StepThreeSummary state={state} />}
      </div>
      <button
        onClick={onEdit}
        className="text-sm text-primary hover:underline"
        type="button"
      >
        Ändern
      </button>
    </div>
  );
}
