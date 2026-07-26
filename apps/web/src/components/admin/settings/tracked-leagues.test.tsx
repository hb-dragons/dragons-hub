// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mocks = vi.hoisted(() => ({
  setLeagues: vi.fn(),
  setLeagueOwnClubRefs: vi.fn(),
  mutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

// Mutable SWR cache keyed the same way the component asks for it. Simulates the
// settings page path where the server prefetch failed (data === null) and the
// client revalidation fills it in a moment later.
const swrData: Record<string, unknown> = {};

vi.mock("swr", () => ({
  default: (key: string | null) => ({ data: key ? swrData[key] : undefined }),
  useSWRConfig: () => ({ mutate: mocks.mutate }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    settings: {
      setLeagues: mocks.setLeagues,
      setLeagueOwnClubRefs: mocks.setLeagueOwnClubRefs,
      getClub: vi.fn(),
      getLeagues: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));

import { TrackedLeagues } from "./tracked-leagues";

const messages = {
  common: { save: "Save", saving: "Saving..." },
  settings: {
    leagues: {
      title: "Tracked Leagues",
      description: "Enter the league numbers",
      numbersLabel: "League Numbers",
      numbersPlaceholder: "e.g. 4102",
      configureClubFirst: "Configure a club first",
      notFound: "Not found: {numbers}",
      columns: {
        ligaNr: "Liga Nr",
        name: "Name",
        season: "Season",
        ownClubRefs: "Own Refs",
      },
      toast: {
        partial: "Partial",
        saved: "Tracking {count}",
        saveFailed: "Failed",
      },
    },
  },
};

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const leaguesPayload = {
  leagues: [
    {
      id: 1,
      ligaNr: 4102,
      name: "Oberliga",
      seasonName: "2025/26",
      ownClubRefs: true,
    },
    {
      id: 2,
      ligaNr: 4105,
      name: "Bezirksliga",
      seasonName: "2025/26",
      ownClubRefs: false,
    },
  ],
};

function input() {
  return screen.getByLabelText("League Numbers") as HTMLInputElement;
}

function saveButton() {
  return screen.getByRole("button", { name: /Save/ });
}

describe("TrackedLeagues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(swrData)) delete swrData[key];
    swrData["/admin/settings/club"] = { clubId: 1, clubName: "Dragons" };
    mocks.setLeagues.mockResolvedValue({ tracked: 2, notFound: [] });
  });
  afterEach(cleanup);

  it("syncs the input once the league list arrives after first render", () => {
    // Server prefetch failed -> SWR fallback is null for the leagues key.
    swrData["/admin/settings/leagues"] = null;
    const { rerender } = render(wrap(<TrackedLeagues />));
    expect(input()).toHaveValue("");

    // Client revalidation lands.
    swrData["/admin/settings/leagues"] = leaguesPayload;
    rerender(wrap(<TrackedLeagues />));

    expect(input()).toHaveValue("4102, 4105");
  });

  it("never posts an empty league list after a failed prefetch", async () => {
    swrData["/admin/settings/leagues"] = null;
    const { rerender } = render(wrap(<TrackedLeagues />));

    // Save must not be usable while the tracked list is unknown.
    expect(saveButton()).toBeDisabled();

    swrData["/admin/settings/leagues"] = leaguesPayload;
    rerender(wrap(<TrackedLeagues />));

    await act(async () => {
      fireEvent.click(saveButton());
    });

    expect(mocks.setLeagues).toHaveBeenCalledWith({
      leagueNumbers: [4102, 4105],
    });
  });

  it("still posts an empty list when the user explicitly clears the field", async () => {
    swrData["/admin/settings/leagues"] = leaguesPayload;
    render(wrap(<TrackedLeagues />));
    expect(input()).toHaveValue("4102, 4105");

    fireEvent.change(input(), { target: { value: "" } });
    await act(async () => {
      fireEvent.click(saveButton());
    });

    expect(mocks.setLeagues).toHaveBeenCalledWith({ leagueNumbers: [] });
  });

  it("keeps user edits when the leagues cache revalidates underneath", () => {
    swrData["/admin/settings/leagues"] = leaguesPayload;
    const { rerender } = render(wrap(<TrackedLeagues />));

    fireEvent.change(input(), { target: { value: "4102" } });
    rerender(wrap(<TrackedLeagues />));

    expect(input()).toHaveValue("4102");
  });
});
