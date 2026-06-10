// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RulesSubtab } from "./rules-subtab";

const ref = { id: 1, apiId: 100, firstName: "A", lastName: "B", licenseNumber: 1, matchCount: 0, allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" };

vi.mock("swr", () => ({
  default: vi.fn((key: string) => {
    if (key === "/admin/teams") return { data: [{ id: 10, name: "Dragons H1", customName: null, leagueName: "OL" }] };
    if (key === `/admin/referees/${ref.id}/rules`) return { data: { rules: [] } };
    return { data: undefined };
  }),
  mutate: vi.fn(),
}));

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
  save: { save: "Save", discard: "Discard", saving: "Saving", saved: "Saved {n}s ago", dirty: "Unsaved", error: "Failed: {msg}" },
} } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => { updateRules.mockClear(); setVisibility.mockClear(); });
afterEach(() => { cleanup(); });

// Tests hit a React 19 + Radix UI (Select, Checkbox) max-update-depth / compose-refs
// instability in happy-dom that causes the vitest worker to hang and crash. The
// same root cause affects profile-subtab. Once Radix ships the compose-refs
// stable-callback fix upstream, drop the .skip and re-enable.
//
// Assertions below track the explicit save model (Save/Discard + inline error) so
// that re-enabling after the upstream fix validates the correct behavior.
describe.skip("RulesSubtab", () => {
  it("Save button is disabled when clean", () => {
    render(wrap(<RulesSubtab referee={ref} />));
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("Save is enabled after adding a rule and POSTs to /rules", async () => {
    render(wrap(<RulesSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(updateRules).toHaveBeenCalledWith(1, expect.objectContaining({ rules: expect.any(Array) }));
    });
  });

  it("Discard resets to fetched rules and clears dirty", () => {
    render(wrap(<RulesSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("surfaces save error inline without toast", async () => {
    updateRules.mockRejectedValueOnce(new Error("boom"));
    render(wrap(<RulesSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.getByText(/Failed: boom/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
  });
});
