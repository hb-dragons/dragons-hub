"use client";

import { useState } from "react";
import type { WizardState } from "./types";
import { PostTypeStep } from "./steps/post-type-step";
import { MatchReviewStep } from "./steps/match-review-step";
import { AssetSelectStep } from "./steps/asset-select-step";

/** Returns the ISO 8601 week number for the given date. */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function getYear(date: Date): number {
  return date.getFullYear();
}

const STEP_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Typ & Woche",
  2: "Spiele",
  3: "Assets",
  4: "Vorschau",
};

const STEPS = [1, 2, 3, 4] as const;

function getInitialState(): WizardState {
  const now = new Date();
  return {
    step: 1,
    postType: "results",
    calendarWeek: getISOWeek(now),
    year: getYear(now),
    matches: [],
    selectedPhotoId: null,
    selectedPhoto: null,
    selectedBackgroundId: null,
    playerPosition: { x: 0, y: 0, scale: 1 },
  };
}

export function PostWizard() {
  const [state, setState] = useState<WizardState>(getInitialState);

  function handleUpdate(updates: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...updates }));
  }

  function handleNext() {
    setState((prev) => {
      if (prev.step < 4) {
        return { ...prev, step: (prev.step + 1) as WizardState["step"] };
      }
      return prev;
    });
  }

  function handleBack() {
    setState((prev) => {
      if (prev.step > 1) {
        return { ...prev, step: (prev.step - 1) as WizardState["step"] };
      }
      return prev;
    });
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Wizard-Schritte">
        <ol className="flex items-center gap-2">
          {STEPS.map((step, index) => {
            const isActive = state.step === step;
            const isCompleted = state.step > step;
            return (
              <li key={step} className="flex items-center gap-2">
                {index > 0 && (
                  <span className="h-px w-8 bg-border" aria-hidden="true" />
                )}
                <span
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isCompleted
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground",
                  ].join(" ")}
                  aria-current={isActive ? "step" : undefined}
                >
                  {step}
                </span>
                <span
                  className={[
                    "text-sm",
                    isActive ? "font-medium text-foreground" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {STEP_LABELS[step]}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      {state.step === 1 && (
        <PostTypeStep state={state} onUpdate={handleUpdate} onNext={handleNext} />
      )}

      {state.step === 2 && (
        <MatchReviewStep state={state} onUpdate={handleUpdate} onNext={handleNext} onBack={handleBack} />
      )}

      {state.step === 3 && (
        <AssetSelectStep state={state} onUpdate={handleUpdate} onNext={handleNext} onBack={handleBack} />
      )}

      {state.step === 4 && (
        <div className="rounded-lg border p-6 text-muted-foreground">
          Schritt 4 — Vorschau (folgt)
          <div className="mt-4">
            <button onClick={handleBack} className="text-sm underline">
              Zurück
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
