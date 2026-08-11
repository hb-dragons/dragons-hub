// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ProfileSubtab } from "./profile-subtab";

const ref = { id: 1, apiId: 100, firstName: "Anna", lastName: "Müller", licenseNumber: 12345, matchCount: 14, allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" };

vi.mock("swr", () => ({
  default: vi.fn(() => ({ data: undefined })),
  mutate: vi.fn(),
}));

const setVisibility = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api", () => ({
  api: { refereeAdmin: { setVisibility: (...a: unknown[]) => setVisibility(...a) } },
  APIError: class extends Error {},
}));

const messages = { refereeHub: { referees: { profile: {
  visibility: { title: "Visibility", ownClub: "Own-club referee", allHome: "Allow all home", away: "Allow away" },
  save: { saving: "Saving…", saved: "Saved {n}s ago", dirty: "Unsaved changes", error: "Save failed", now: "Save now" },
} } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => { vi.useFakeTimers(); setVisibility.mockClear(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

// These tests drive a debounce, so they run on fake timers. Do NOT reach for
// `waitFor` here: @testing-library/dom only knows how to pump *jest* fake
// timers, so under vitest's fake timers its polling loop never advances and
// the test hangs until the vitest timeout. Advance the clock inside `act`
// instead — that flushes both the debounce timer and the React work it queues.
describe("ProfileSubtab", () => {
  it("auto-saves via /visibility endpoint after debounce", async () => {
    render(wrap(<ProfileSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("switch", { name: /allow all home/i }));

    expect(setVisibility).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(setVisibility).toHaveBeenCalledWith(1, {
      allowAllHomeGames: false,
      allowAwayGames: true,
      isOwnClub: true,
    });
    expect(screen.getByText(/^Saved /)).toBeInTheDocument();
  });

  it("Save now button bypasses debounce", async () => {
    render(wrap(<ProfileSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("switch", { name: /allow all home/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save now/i }));
    });

    expect(setVisibility).toHaveBeenCalledTimes(1);
    expect(setVisibility).toHaveBeenCalledWith(1, {
      allowAllHomeGames: false,
      allowAwayGames: true,
      isOwnClub: true,
    });

    // The debounce timer was cancelled, not merely pre-empted: letting it
    // expire must not fire a second save.
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(setVisibility).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed save without losing the pending edit", async () => {
    setVisibility.mockRejectedValueOnce(new Error("boom"));
    render(wrap(<ProfileSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("switch", { name: /allow away/i }));

    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(setVisibility).toHaveBeenCalledWith(1, {
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    expect(screen.getByText("Save failed")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /allow away/i })).toHaveAttribute("aria-checked", "false");
  });
});
