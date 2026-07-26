// @vitest-environment happy-dom
//
// The social post wizard (components/admin/social/**) was entirely
// hardcoded German — an English-locale admin saw a fully German wizard.
// `pnpm check:i18n` never caught it because it only diffs the DE/EN
// catalogs against each other, and these strings never reached a catalog.
// These tests render each step directly (no data-fetching wiring needed)
// against the *real* en.json/de.json catalogs and assert the opposite
// locale's known-hardcoded text is gone.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import deMessages from "@/messages/de.json";

import { PostTypeStep } from "./steps/post-type-step";
import { MatchReviewStep } from "./steps/match-review-step";
import { AssetSelectStep } from "./steps/asset-select-step";
import { PreviewStep } from "./steps/preview-step";
import { CollapsedStepSummary } from "./collapsed-step-summary";
import type { MatchItem, WeekendOption, WizardState } from "./types";

vi.mock("@/lib/api", () => ({
  api: {
    social: {
      listPlayerPhotos: vi.fn().mockResolvedValue([]),
      listBackgrounds: vi.fn().mockResolvedValue([]),
    },
  },
  browserClient: { postBlob: vi.fn() },
}));

function wrap(ui: React.ReactNode, locale: "en" | "de" = "en") {
  const messages = locale === "en" ? enMessages : deMessages;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

const weekendOption: WeekendOption = {
  week: 12,
  year: 2026,
  dateFrom: "2026-03-14",
  dateTo: "2026-03-15",
  matchCount: 3,
  matches: [],
};

const baseState: WizardState = {
  step: 1,
  furthestStep: 1,
  postType: "results",
  calendarWeek: 12,
  year: 2026,
  weekendLabel: "Sat 14. – Sun 15. Mar",
  matches: [],
  selectedPhotoId: null,
  selectedPhoto: null,
  selectedBackgroundId: null,
  selectedBackground: null,
  playerPosition: { x: 0, y: 0, scale: 1 },
};

const match: MatchItem = {
  id: 1,
  teamLabel: "1. Herren",
  opponent: "Rivals",
  isHome: true,
  kickoffDate: "2026-03-14",
  kickoffTime: "18:00",
  homeScore: null,
  guestScore: null,
};

describe("social post wizard i18n", () => {
  afterEach(cleanup);

  it.each(["en", "de"] as const)("PostTypeStep renders fully in %s with no leaked German/English", (locale) => {
    render(
      wrap(
        <PostTypeStep
          resultsOption={weekendOption}
          previewOption={weekendOption}
          loading={false}
          error={null}
          onSelectCard={vi.fn()}
          onNavigateWeek={vi.fn()}
          canNavigatePrev
          canNavigateNext
          weekLabel="Week 12 / 13"
        />,
        locale,
      ),
    );
    const m = locale === "en" ? enMessages.socialWizard : deMessages.socialWizard;
    expect(screen.getByText(m.createTitle)).toBeInTheDocument();
    expect(screen.getByText(m.resultsLabel)).toBeInTheDocument();
    expect(screen.getByText(m.previewLabel)).toBeInTheDocument();
    expect(screen.getByText(m.lastWeekendLabel)).toBeInTheDocument();
    expect(screen.getByText(m.nextWeekendLabel)).toBeInTheDocument();
    expect(screen.getByText(m.chooseOtherWeekLabel)).toBeInTheDocument();

    if (locale === "en") {
      expect(screen.queryByText("Social Post erstellen")).not.toBeInTheDocument();
      expect(screen.queryByText("Ergebnisse")).not.toBeInTheDocument();
    } else {
      expect(screen.queryByText("Results")).not.toBeInTheDocument();
    }
  });

  it.each(["en", "de"] as const)("MatchReviewStep renders fully in %s", (locale) => {
    render(
      wrap(
        <MatchReviewStep
          matches={[match]}
          loading={false}
          error={null}
          onUpdateMatches={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
        />,
        locale,
      ),
    );
    const m = locale === "en" ? enMessages.socialWizard : deMessages.socialWizard;
    expect(screen.getByText(m.selectMatchesTitle)).toBeInTheDocument();
    expect(screen.getByText(m.homeLabel)).toBeInTheDocument();
    expect(screen.getByText(m.vsLabel)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.back })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.moveUpAria })).toBeInTheDocument();

    if (locale === "en") {
      expect(screen.queryByText("Heim")).not.toBeInTheDocument();
      expect(screen.queryByText("Zurück")).not.toBeInTheDocument();
    } else {
      expect(screen.queryByText("Home")).not.toBeInTheDocument();
    }
  });

  it.each(["en", "de"] as const)("AssetSelectStep renders fully in %s", async (locale) => {
    render(
      wrap(
        <AssetSelectStep state={baseState} onUpdate={vi.fn()} onNext={vi.fn()} onBack={vi.fn()} />,
        locale,
      ),
    );
    const m = locale === "en" ? enMessages.socialWizard : deMessages.socialWizard;
    expect(await screen.findByText(m.selectAssetsTitle)).toBeInTheDocument();
    expect(screen.getByText(m.photoLabel)).toBeInTheDocument();

    if (locale === "en") {
      expect(screen.queryByText("Assets auswählen")).not.toBeInTheDocument();
    } else {
      expect(screen.queryByText("Select assets")).not.toBeInTheDocument();
    }
  });

  it.each(["en", "de"] as const)("PreviewStep chrome renders fully in %s", (locale) => {
    render(
      wrap(<PreviewStep state={baseState} onUpdate={vi.fn()} onBack={vi.fn()} />, locale),
    );
    const m = locale === "en" ? enMessages.socialWizard : deMessages.socialWizard;
    expect(screen.getByText(m.dragHelpText)).toBeInTheDocument();
    expect(screen.getByText(m.generateAndDownload)).toBeInTheDocument();

    if (locale === "en") {
      expect(
        screen.queryByText("Spielerfoto per Drag & Drop positionieren und mit den Ecken skalieren."),
      ).not.toBeInTheDocument();
    }
  });

  it.each(["en", "de"] as const)("CollapsedStepSummary renders fully in %s", (locale) => {
    render(wrap(<CollapsedStepSummary step={2} state={{ ...baseState, matches: [match] }} onEdit={vi.fn()} />, locale));
    const m = locale === "en" ? enMessages.socialWizard : deMessages.socialWizard;
    expect(screen.getByText(m.edit)).toBeInTheDocument();
    // Real ICU pluralisation, not `${count} Spiele` string concatenation.
    const expectedCount = locale === "en" ? "1 match" : "1 Spiel";
    expect(screen.getByText(expectedCount)).toBeInTheDocument();

    if (locale === "en") {
      expect(screen.queryByText("Ändern")).not.toBeInTheDocument();
    } else {
      expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    }
  });
});
