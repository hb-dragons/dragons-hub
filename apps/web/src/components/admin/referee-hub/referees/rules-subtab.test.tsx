// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RulesSubtab } from "./rules-subtab";

const ref = { id: 1, apiId: 100, firstName: "A", lastName: "B", licenseNumber: 1, matchCount: 0, allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" };

// The mocked payloads are module-level constants on purpose. RulesSubtab seeds
// its local `rules` state from an effect keyed on the SWR `data` identity, so a
// mock that built a fresh object per call would hand back a new dependency on
// every render and spin render -> setState -> render forever, hanging the
// worker. Real SWR keeps `data` referentially stable; the mock has to as well.
vi.mock("swr", () => {
  const teams = [{ id: 10, name: "Dragons H1", customName: null, leagueName: "OL" }];
  const rules = { rules: [] };
  return {
    default: vi.fn((key: string) => {
      if (key === "/admin/teams") return { data: teams };
      if (key === "/admin/referees/1/rules") return { data: rules };
      return { data: undefined };
    }),
    mutate: vi.fn(),
  };
});

const updateRules = vi.fn().mockResolvedValue({ rules: [] });
const setVisibility = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api", () => ({
  api: {
    refereeAdmin: {
      updateRules: (...a: unknown[]) => updateRules(...a),
      setVisibility: (...a: unknown[]) => setVisibility(...a),
    },
  },
  APIError: class extends Error {},
}));

const messages = { refereeHub: { referees: { rules: {
  title: "Rules", add: "Add", deny: "Deny", allow: "Allow", selectTeam: "Team", none: "No rules",
  allowSr1: "SR1", allowSr2: "SR2", removeRule: "Remove rule",
  disabledHint: "Not an own-club referee", markOwnClub: "Mark as own club",
  save: { save: "Save", discard: "Discard", saving: "Saving", saved: "Saved {n}s ago", dirty: "Unsaved", error: "Failed: {msg}" },
} } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

const saveButton = () => screen.getByRole("button", { name: /^save$/i });
const discardButton = () => screen.getByRole("button", { name: /discard/i });
const addRule = () => fireEvent.click(screen.getByRole("button", { name: /add/i }));

beforeEach(() => { updateRules.mockClear(); setVisibility.mockClear(); });
afterEach(() => { cleanup(); });

// Assertions track the explicit save model (Save/Discard + inline error) that
// the Profile/Rules subtab split introduced.
describe("RulesSubtab", () => {
  it("Save button is disabled when clean", () => {
    render(wrap(<RulesSubtab referee={ref} />));
    expect(saveButton()).toBeDisabled();
    expect(discardButton()).toBeDisabled();
    expect(screen.getByText("No rules")).toBeInTheDocument();
  });

  it("Save is enabled after adding a rule and POSTs to /rules", async () => {
    render(wrap(<RulesSubtab referee={ref} />));
    addRule();
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText("Unsaved")).toBeInTheDocument();

    await act(async () => { fireEvent.click(saveButton()); });

    // The new row defaults to SR2-only, and the payload carries that verbatim.
    expect(updateRules).toHaveBeenCalledWith(1, {
      rules: [{ teamId: 10, deny: false, allowSr1: false, allowSr2: true }],
    });
    expect(saveButton()).toBeDisabled();
  });

  it("Discard resets to fetched rules and clears dirty", () => {
    render(wrap(<RulesSubtab referee={ref} />));
    addRule();
    expect(screen.queryByText("No rules")).not.toBeInTheDocument();

    fireEvent.click(discardButton());

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("No rules")).toBeInTheDocument();
    expect(updateRules).not.toHaveBeenCalled();
  });

  it("surfaces save error inline without toast", async () => {
    updateRules.mockRejectedValueOnce(new Error("boom"));
    render(wrap(<RulesSubtab referee={ref} />));
    addRule();

    await act(async () => { fireEvent.click(saveButton()); });

    expect(screen.getByText("Failed: boom")).toBeInTheDocument();
    // Still dirty, so the edit can be retried rather than silently dropped.
    expect(saveButton()).toBeEnabled();
    expect(discardButton()).toBeEnabled();
  });

  it("drops a rule that neither denies nor allows anything", async () => {
    render(wrap(<RulesSubtab referee={ref} />));
    addRule();
    const [, sr2] = screen.getAllByRole("checkbox");
    fireEvent.click(sr2);

    await act(async () => { fireEvent.click(saveButton()); });

    expect(updateRules).toHaveBeenCalledWith(1, { rules: [] });
  });

  it("renders the own-club prompt instead of the editor for external referees", () => {
    render(wrap(<RulesSubtab referee={{ ...ref, isOwnClub: false }} />));
    expect(screen.getByText("Not an own-club referee")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /mark as own club/i }));
    expect(setVisibility).toHaveBeenCalledWith(1, {
      isOwnClub: true,
      allowAllHomeGames: true,
      allowAwayGames: true,
    });
  });
});
