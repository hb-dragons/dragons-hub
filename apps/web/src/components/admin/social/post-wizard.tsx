"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchItem, PostType, WeekendOption, WizardState } from "./types";
import { PostTypeStep } from "./steps/post-type-step";
import { MatchReviewStep } from "./steps/match-review-step";
import { AssetSelectStep } from "./steps/asset-select-step";
import { PreviewStep } from "./steps/preview-step";
import { CollapsedStepSummary } from "./collapsed-step-summary";
import {
  getLastWeekendSaturday,
  getNextWeekendSaturday,
  getISOWeekAndYear,
  formatDateRange,
  previousSaturday,
  nextSaturday,
  toDateString,
} from "./weekend-utils";
import { getSunday } from "@/lib/weekend-utils";
import { fetchAPI } from "@/lib/api";

const MAX_WEEK_OFFSET = 8;

function getInitialState(): WizardState {
  return {
    step: 1,
    furthestStep: 1,
    postType: "results",
    calendarWeek: 1,
    year: 2026,
    weekendLabel: "",
    matches: [],
    selectedPhotoId: null,
    selectedPhoto: null,
    selectedBackgroundId: null,
    selectedBackground: null,
    playerPosition: { x: 0, y: 0, scale: 1 },
  };
}

async function fetchWeekendOption(
  type: "results" | "preview",
  saturday: Date,
): Promise<WeekendOption> {
  const { week, year } = getISOWeekAndYear(saturday);
  const dateFrom = toDateString(saturday);
  const dateTo = toDateString(getSunday(saturday));
  const matches = await fetchAPI<MatchItem[]>(
    `/admin/social/matches?type=${type}&week=${week}&year=${year}`,
  );
  const sliced = matches.slice(0, 6);
  return { week, year, dateFrom, dateTo, matchCount: sliced.length, matches: sliced };
}

export function PostWizard() {
  const [state, setState] = useState<WizardState>(getInitialState);

  // Weekend navigation state
  const [weekOffset, setWeekOffset] = useState(0);
  const [resultsOption, setResultsOption] = useState<WeekendOption | null>(null);
  const [previewOption, setPreviewOption] = useState<WeekendOption | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [cardError, setCardError] = useState<string | null>(null);

  // Track what week/type the current matches were fetched for
  const matchSourceRef = useRef<{ week: number; type: PostType } | null>(null);

  // Calculate the base Saturdays (offset = 0)
  const baseSatResults = getLastWeekendSaturday();
  const baseSatPreview = getNextWeekendSaturday();

  // Apply offset
  function applyOffset(base: Date, offset: number): Date {
    let d = new Date(base);
    const step = offset > 0 ? nextSaturday : previousSaturday;
    for (let i = 0; i < Math.abs(offset); i++) {
      d = step(d);
    }
    return d;
  }

  const currentResultsSat = applyOffset(baseSatResults, weekOffset);
  const currentPreviewSat = applyOffset(baseSatPreview, weekOffset);
  const weekLabel = `KW ${getISOWeekAndYear(currentResultsSat).week} / ${getISOWeekAndYear(currentPreviewSat).week}`;

  // Fetch weekend data whenever offset changes
  useEffect(() => {
    let cancelled = false;
    setCardLoading(true);
    setCardError(null);

    Promise.all([
      fetchWeekendOption("results", currentResultsSat),
      fetchWeekendOption("preview", currentPreviewSat),
    ])
      .then(([results, preview]) => {
        if (!cancelled) {
          setResultsOption(results);
          setPreviewOption(preview);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCardError(err instanceof Error ? err.message : "Fehler beim Laden");
        }
      })
      .finally(() => {
        if (!cancelled) setCardLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  function handleUpdate(updates: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...updates }));
  }

  function handleSelectCard(type: PostType, option: WeekendOption) {
    const source = matchSourceRef.current;
    const needsNewMatches = !source || source.week !== option.week || source.type !== type;
    const label = formatDateRange(option.dateFrom, option.dateTo);

    setState((prev) => ({
      ...prev,
      postType: type,
      calendarWeek: option.week,
      year: option.year,
      weekendLabel: label,
      matches: needsNewMatches ? option.matches : prev.matches,
      step: 2,
      furthestStep: Math.max(prev.furthestStep, 2) as WizardState["furthestStep"],
    }));

    if (needsNewMatches) {
      matchSourceRef.current = { week: option.week, type };
    }
  }

  function handleNext() {
    setState((prev) => {
      if (prev.step < 4) {
        const next = (prev.step + 1) as WizardState["step"];
        return {
          ...prev,
          step: next,
          furthestStep: Math.max(prev.furthestStep, next) as WizardState["furthestStep"],
        };
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

  function handleGoToStep(step: 1 | 2 | 3) {
    setState((prev) => ({ ...prev, step }));
  }

  const handleUpdateMatches = useCallback((matches: MatchItem[]) => {
    setState((prev) => ({ ...prev, matches }));
  }, []);

  return (
    <div className="space-y-3">
      {/* Collapsed strips for completed steps before the active one */}
      {state.step > 1 && state.furthestStep >= 1 && (
        <CollapsedStepSummary step={1} state={state} onEdit={() => handleGoToStep(1)} />
      )}

      {state.step > 2 && state.furthestStep >= 2 && (
        <CollapsedStepSummary step={2} state={state} onEdit={() => handleGoToStep(2)} />
      )}

      {state.step > 3 && state.furthestStep >= 3 && (
        <CollapsedStepSummary step={3} state={state} onEdit={() => handleGoToStep(3)} />
      )}

      {/* Active step */}
      {state.step === 1 && (
        <PostTypeStep
          resultsOption={resultsOption}
          previewOption={previewOption}
          loading={cardLoading}
          error={cardError}
          onSelectCard={handleSelectCard}
          onNavigateWeek={(dir) =>
            setWeekOffset((prev) =>
              dir === "prev" ? Math.max(prev - 1, -MAX_WEEK_OFFSET) : Math.min(prev + 1, MAX_WEEK_OFFSET),
            )
          }
          canNavigatePrev={weekOffset > -MAX_WEEK_OFFSET}
          canNavigateNext={weekOffset < MAX_WEEK_OFFSET}
          weekLabel={weekLabel}
        />
      )}

      {state.step === 2 && (
        <MatchReviewStep
          matches={state.matches}
          loading={false}
          error={null}
          onUpdateMatches={handleUpdateMatches}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {state.step === 3 && (
        <AssetSelectStep state={state} onUpdate={handleUpdate} onNext={handleNext} onBack={handleBack} />
      )}

      {state.step === 4 && (
        <PreviewStep state={state} onUpdate={handleUpdate} onBack={handleBack} />
      )}
    </div>
  );
}
