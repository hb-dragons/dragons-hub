// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OwnClubTeam } from "@dragons/shared";

const entry: OwnClubTeam = {
  id: 1, teamId: 10, name: "Dragons U16", nameShort: "U16", customName: null,
  leagueId: 5, leagueName: "U16 Vorab", leagueTracked: false, linkSource: "seeded",
  estimatedGameDuration: null, badgeColor: null, displayOrder: 0,
};
const bezirksliga = { id: 6, ligaNr: 1, apiLigaId: 60, name: "U16 Bezirksliga", seasonName: "s", ownClubRefs: false };

// Per-test SWR data. The mock resolves by key prefix, so a test swaps the
// teams list or the season's tracked leagues before it renders.
const swr = vi.hoisted(() => ({
  teams: [] as OwnClubTeam[],
  leagues: undefined as unknown,
}));

vi.mock("swr", () => ({
  default: (key: string | null) => {
    if (key === null) return { data: undefined, mutate: vi.fn() };
    if (String(key).startsWith("/admin/teams")) return { data: swr.teams, mutate: vi.fn() };
    if (String(key).startsWith("/admin/seasons/")) return { data: swr.leagues, mutate: vi.fn() };
    return { data: [{ id: 9, name: "2026/27", status: "active" }], mutate: vi.fn() };
  },
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: { teams: { update: vi.fn(), reorder: vi.fn() }, seasons: { getLeagues: vi.fn() } } }));

import { TeamsTable } from "./teams-table";
import { api } from "@/lib/api";
import en from "@/messages/en.json";

beforeEach(() => {
  vi.clearAllMocks();
  swr.teams = [entry];
  swr.leagues = { leagueNumbers: [], leagues: [bezirksliga] };
});
afterEach(() => cleanup());

function renderTable() {
  return render(
    <NextIntlClientProvider locale="en" timeZone="Europe/Berlin" messages={en}>
      <TeamsTable canManage={true} />
    </NextIntlClientProvider>,
  );
}

/** The league select of the one rendered row (the season picker is a combobox too). */
function leagueSelect(teamName = "Dragons U16") {
  return within(screen.getByText(teamName).closest("tr")!).getByRole("combobox");
}

/** Drives a Radix Select purely by keyboard: open, pick the option by name. */
async function pickOption(trigger: HTMLElement, label: string) {
  fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
  const option = await screen.findByRole("option", { name: label });
  fireEvent.keyDown(option, { key: "Enter", code: "Enter" });
}

describe("TeamsTable league column", () => {
  it("shows the untracked-league warning for a stale connection", () => {
    renderTable();
    expect(screen.getByText(/League no longer tracked/)).toBeInTheDocument();
  });

  it("offers the season's tracked leagues plus 'Not connected', keeping the stale current league pickable", async () => {
    renderTable();
    expect(leagueSelect()).toHaveTextContent("U16 Vorab");

    fireEvent.keyDown(leagueSelect(), { key: "Enter", code: "Enter" });

    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual(["Not connected", "U16 Bezirksliga", "U16 Vorab"]);
  });

  it("renders 'Not connected' without the warning for a team with no league", () => {
    swr.teams = [{ ...entry, leagueId: null, leagueName: null, leagueTracked: true }];
    renderTable();

    expect(leagueSelect()).toHaveTextContent("Not connected");
    expect(screen.queryByText(/League no longer tracked/)).not.toBeInTheDocument();
  });

  it("lists only 'Not connected' and the current league when the season tracks no leagues", async () => {
    swr.leagues = { leagueNumbers: [], leagues: [] };
    renderTable();

    fireEvent.keyDown(leagueSelect(), { key: "Enter", code: "Enter" });

    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual(["Not connected", "U16 Vorab"]);
  });

  it("marks the row dirty once a league is picked, and sends that league on save", async () => {
    vi.mocked(api.teams.update).mockResolvedValue({
      ...entry, leagueId: 6, leagueName: "U16 Bezirksliga", leagueTracked: true, linkSource: "manual",
    });
    renderTable();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await pickOption(leagueSelect(), "U16 Bezirksliga");

    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(api.teams.update).toHaveBeenCalledTimes(1));
    const [id, body] = vi.mocked(api.teams.update).mock.calls[0]!;
    expect(id).toBe(entry.id);
    expect(body).toMatchObject({ leagueId: 6 });
  });
});

describe("TeamsTable save", () => {
  it("does not send leagueId when only the custom name changed, so link_source is not touched", async () => {
    vi.mocked(api.teams.update).mockResolvedValue({ ...entry, customName: "New Name" });
    renderTable();

    fireEvent.change(screen.getByPlaceholderText("Enter custom name..."), {
      target: { value: "New Name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.teams.update).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(api.teams.update).mock.calls[0]!;
    expect(body).not.toHaveProperty("leagueId");
    expect(body).toMatchObject({ customName: "New Name" });
  });
});

describe("TeamsTable staff column", () => {
  it("offers a staff editor on the row", () => {
    renderTable();
    expect(screen.getByRole("button", { name: "Staff" })).toBeInTheDocument();
  });
});
