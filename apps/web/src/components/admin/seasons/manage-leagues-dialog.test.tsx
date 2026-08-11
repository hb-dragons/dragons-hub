// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { getLeagues, discover, setLeagues, trigger, leagueTeams, toastError, toastSuccess, mutate } = vi.hoisted(() => ({
  getLeagues: vi.fn(), discover: vi.fn(), setLeagues: vi.fn(), trigger: vi.fn(),
  leagueTeams: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(), mutate: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: { seasons: { getLeagues, discover, setLeagues, leagueTeams }, sync: { trigger } },
}));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { ManageLeaguesDialog } from "./manage-leagues-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  // Season already tracks league 1; discover returns 1 (tracked) and 2 (untracked).
  getLeagues.mockResolvedValue({
    leagueNumbers: [],
    leagues: [{ id: 11, ligaNr: 0, apiLigaId: 1, name: "Landesliga Herren 2", seasonName: "2026/27", ownClubRefs: false }],
  });
  discover.mockResolvedValue([
    { ligaId: 1, ligaNr: null, name: "Landesliga Herren 2", skName: "Landesliga", akName: "Senioren", geschlecht: "männlich", vorabliga: true, alreadyTracked: true },
    { ligaId: 2, ligaNr: null, name: "Landesliga Damen 2", skName: "Landesliga", akName: "Senioren", geschlecht: "weiblich", vorabliga: true, alreadyTracked: false },
  ]);
  setLeagues.mockResolvedValue({ tracked: 2, untracked: 0 });
  trigger.mockResolvedValue({ ok: true });
  leagueTeams.mockResolvedValue({ teams: [] });
});
afterEach(cleanup);

describe("ManageLeaguesDialog", () => {
  it("seeds the checked set from the season's current leagues", async () => {
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Herren 2");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toBeChecked();   // league 1, already tracked
    expect(boxes[1]).not.toBeChecked(); // league 2
  });

  it("saves the new set and triggers a sync", async () => {
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Damen 2");
    fireEvent.click(screen.getAllByRole("checkbox")[1]!); // add league 2
    fireEvent.click(screen.getByText("settings.seasons.manage.save"));
    await waitFor(() => expect(setLeagues).toHaveBeenCalledWith(9, { ligaIds: [1, 2] }));
    await waitFor(() => expect(trigger).toHaveBeenCalled());
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/admin/seasons"));
    expect(toastSuccess).toHaveBeenCalledWith("settings.seasons.manage.saved");
  });

  it("keeps the dialog open and toasts when saving fails", async () => {
    setLeagues.mockRejectedValueOnce(new Error("boom"));
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Herren 2");
    fireEvent.click(screen.getByText("settings.seasons.manage.save"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("settings.seasons.manage.saveFailed"));
    expect(screen.getByText("settings.seasons.manage.save")).toBeInTheDocument();
  });

  it("preserves in-progress league edits when the club-filter toggle is flipped", async () => {
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Damen 2");
    // Check league 2 (pending add — not yet persisted).
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    // Flip the own-club-only switch to trigger a reload.
    fireEvent.click(screen.getByLabelText("settings.seasons.wizard.ownClubOnly"));
    // Wait for the second discover call (reload completed).
    await waitFor(() => expect(discover).toHaveBeenCalledTimes(2));
    // Pending selection must survive the filter-toggle reload.
    expect(screen.getAllByRole("checkbox")[1]).toBeChecked();
  });

  it("browses without the vorabliga filter on open and re-requests when it is switched on", async () => {
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Herren 2");
    // Mid-season the missing leagues are exactly the ones the federation no
    // longer flags vorabliga, so the dialog must not filter by default.
    expect(discover).toHaveBeenCalledWith(9, { vorabligaOnly: false, ownClubOnly: true });
    fireEvent.click(screen.getByLabelText("settings.seasons.wizard.vorabligaOnly"));
    await waitFor(() =>
      expect(discover).toHaveBeenLastCalledWith(9, { vorabligaOnly: true, ownClubOnly: true }),
    );
  });
});
