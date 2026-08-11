// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mocks = vi.hoisted(() => ({
  setLeagueOwnClubRefs: vi.fn(),
  mutate: vi.fn(),
  toastError: vi.fn(),
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
      setLeagueOwnClubRefs: mocks.setLeagueOwnClubRefs,
      getClub: vi.fn(),
      getLeagues: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

import { TrackedLeagues } from "./tracked-leagues";

const messages = {
  common: {
    save: "Save",
    saving: "Saving...",
    search: "Search",
    noResults: "No results",
    columns: "Columns",
    columnsToggle: "Toggle columns",
  },
  settings: {
    leagues: {
      title: "Tracked Leagues",
      description: "Leagues tracked for the active season",
      configureClubFirst: "Configure a club first",
      columns: {
        ligaNr: "Liga Nr",
        name: "Name",
        season: "Season",
        ownClubRefs: "Own Refs",
      },
      toast: { saveFailed: "Failed" },
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
    { id: 1, ligaNr: 4102, name: "Oberliga", seasonName: "2025/26", ownClubRefs: true },
    { id: 2, ligaNr: 4105, name: "Bezirksliga", seasonName: "2025/26", ownClubRefs: false },
  ],
};

describe("TrackedLeagues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(swrData)) delete swrData[key];
    swrData["/admin/settings/club"] = { clubId: 1, clubName: "Dragons" };
    mocks.setLeagueOwnClubRefs.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it("lists the active season's tracked leagues", () => {
    swrData["/admin/settings/leagues"] = leaguesPayload;
    render(wrap(<TrackedLeagues />));

    expect(screen.getByText("Oberliga")).toBeInTheDocument();
    expect(screen.getByText("Bezirksliga")).toBeInTheDocument();
    expect(screen.getByText("4102")).toBeInTheDocument();
  });

  it("offers no way to edit the tracked set — that moved to the seasons page", () => {
    swrData["/admin/settings/leagues"] = leaguesPayload;
    render(wrap(<TrackedLeagues />));

    // The paste-a-list-of-league-numbers form was removed with the route behind
    // it; `liganr` is null for preliminary leagues, so it could not reach a new
    // season's leagues at all.
    expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/League Numbers/)).not.toBeInTheDocument();
  });

  it("prompts to configure a club before anything is tracked", () => {
    delete swrData["/admin/settings/club"];
    render(wrap(<TrackedLeagues />));

    expect(screen.getByText("Configure a club first")).toBeInTheDocument();
  });

  it("renders nothing but the prompt when the league list has not arrived yet", () => {
    render(wrap(<TrackedLeagues />));

    expect(screen.queryByText("Oberliga")).not.toBeInTheDocument();
  });

  it("persists an own-club-refs toggle and revalidates the list", async () => {
    swrData["/admin/settings/leagues"] = leaguesPayload;
    render(wrap(<TrackedLeagues />));

    const toggles = screen.getAllByRole("switch");
    await act(async () => {
      fireEvent.click(toggles[1]!); // Bezirksliga, currently false
    });

    expect(mocks.setLeagueOwnClubRefs).toHaveBeenCalledWith(2, { ownClubRefs: true });
    expect(mocks.mutate).toHaveBeenCalledWith("/admin/settings/leagues");
  });

  it("surfaces a toast when the toggle fails to save", async () => {
    swrData["/admin/settings/leagues"] = leaguesPayload;
    mocks.setLeagueOwnClubRefs.mockRejectedValue(new Error("nope"));
    render(wrap(<TrackedLeagues />));

    await act(async () => {
      fireEvent.click(screen.getAllByRole("switch")[0]!);
    });

    expect(mocks.toastError).toHaveBeenCalledWith("Failed");
  });
});
