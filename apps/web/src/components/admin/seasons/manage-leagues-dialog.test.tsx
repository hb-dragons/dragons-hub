// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { getLeagues, discover, setLeagues, trigger, leagueTeams, toastError, toastSuccess, toastWarning, mutate } = vi.hoisted(() => ({
  getLeagues: vi.fn(), discover: vi.fn(), setLeagues: vi.fn(), trigger: vi.fn(),
  leagueTeams: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), mutate: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: { seasons: { getLeagues, discover, setLeagues, leagueTeams }, sync: { trigger } },
}));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError, warning: toastWarning } }));

import { ManageLeaguesDialog } from "./manage-leagues-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  // Season already tracks league 1; discover returns 1 (tracked) and 2 (untracked).
  getLeagues.mockResolvedValue({
    leagueNumbers: [],
    leagues: [{ id: 11, ligaNr: 0, apiLigaId: 1, name: "Landesliga Herren 2", seasonName: "2026/27", ownClubRefs: false, isCup: false }],
  });
  discover.mockResolvedValue([
    { ligaId: 1, ligaNr: null, name: "Landesliga Herren 2", skName: "Landesliga", akName: "Senioren", geschlecht: "männlich", vorabliga: true, alreadyTracked: true, conflictSeasonName: null, isCup: false },
    { ligaId: 2, ligaNr: null, name: "Landesliga Damen 2", skName: "Landesliga", akName: "Senioren", geschlecht: "weiblich", vorabliga: true, alreadyTracked: false, conflictSeasonName: null, isCup: false },
  ]);
  setLeagues.mockResolvedValue({ tracked: 2, untracked: 0, entriesSeeded: 0, rosterFailures: [], conflicts: [] });
  trigger.mockResolvedValue({ ok: true });
  leagueTeams.mockResolvedValue({ teams: [] });
});
afterEach(cleanup);

describe("ManageLeaguesDialog", () => {
  it("seeds the checked set from the season's current leagues", async () => {
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Herren 2");
    expect(screen.getByRole("checkbox", { name: "Landesliga Herren 2" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Landesliga Damen 2" })).not.toBeChecked();
  });

  it("saves the new set and triggers a sync", async () => {
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Damen 2");
    fireEvent.click(screen.getByRole("checkbox", { name: "Landesliga Damen 2" })); // add league 2
    fireEvent.click(screen.getByText("settings.seasons.manage.save"));
    await waitFor(() => expect(setLeagues).toHaveBeenCalledWith(9, { ligaIds: [1, 2], cupLigaIds: [] }));
    await waitFor(() => expect(trigger).toHaveBeenCalled());
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/admin/seasons"));
    expect(toastSuccess).toHaveBeenCalledWith("settings.seasons.manage.saved");
  });

  it("warns about ligas the API refused because another season owns them (#227)", async () => {
    setLeagues.mockResolvedValueOnce({
      tracked: 1,
      untracked: 0,
      entriesSeeded: 0,
      rosterFailures: [],
      conflicts: [
        { ligaId: 2, name: "Landesliga Damen 2", ownedBySeasonId: 4, ownedBySeasonName: "2025/26" },
      ],
    });
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Damen 2");
    fireEvent.click(screen.getByText("settings.seasons.manage.save"));
    await waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith("settings.seasons.leagueConflicts"),
    );
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
    fireEvent.click(screen.getByRole("checkbox", { name: "Landesliga Damen 2" }));
    // Flip the own-club-only switch to trigger a reload.
    fireEvent.click(screen.getByLabelText("settings.seasons.wizard.ownClubOnly"));
    // Wait for the second discover call (reload completed).
    await waitFor(() => expect(discover).toHaveBeenCalledTimes(2));
    // Pending selection must survive the filter-toggle reload.
    expect(screen.getByRole("checkbox", { name: "Landesliga Damen 2" })).toBeChecked();
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

  describe("cups", () => {
    const CUP = "settings.seasons.wizard.cup";

    it("offers the cup switch only on selected leagues, prefilled from the API", async () => {
      discover.mockResolvedValueOnce([
        { ligaId: 1, ligaNr: null, name: "Landesliga Herren 2", skName: "Landesliga", akName: "Senioren", geschlecht: "männlich", vorabliga: false, alreadyTracked: true, conflictSeasonName: null, isCup: false },
        { ligaId: 3, ligaNr: null, name: "Kreispokal Herren", skName: "Pokal", akName: "Senioren", geschlecht: "männlich", vorabliga: false, alreadyTracked: false, conflictSeasonName: null, isCup: true },
      ]);
      render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
      await screen.findByText("Kreispokal Herren");
      expect(screen.getByRole("checkbox", { name: `${CUP}: Landesliga Herren 2` })).not.toBeChecked();
      expect(screen.queryByRole("checkbox", { name: `${CUP}: Kreispokal Herren` })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("checkbox", { name: "Kreispokal Herren" }));
      expect(screen.getByRole("checkbox", { name: `${CUP}: Kreispokal Herren` })).toBeChecked();

      fireEvent.click(screen.getByText("settings.seasons.manage.save"));
      await waitFor(() =>
        expect(setLeagues).toHaveBeenCalledWith(9, { ligaIds: [1, 3], cupLigaIds: [3] }),
      );
    });

    it("sends the admin's cup choice, including a tracked league flagged by hand", async () => {
      getLeagues.mockResolvedValueOnce({
        leagueNumbers: [],
        // Tracked but outside the browse result: the flag comes from the season's row.
        leagues: [{ id: 12, ligaNr: 0, apiLigaId: 5, name: "Bezirkspokal Damen", seasonName: "2026/27", ownClubRefs: false, isCup: true }],
      });
      render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
      await screen.findByText("Bezirkspokal Damen");
      expect(screen.getByRole("checkbox", { name: `${CUP}: Bezirkspokal Damen` })).toBeChecked();

      fireEvent.click(screen.getByRole("checkbox", { name: "Landesliga Damen 2" }));
      fireEvent.click(screen.getByRole("checkbox", { name: `${CUP}: Landesliga Damen 2` }));
      fireEvent.click(screen.getByRole("checkbox", { name: `${CUP}: Bezirkspokal Damen` }));
      fireEvent.click(screen.getByText("settings.seasons.manage.save"));
      await waitFor(() =>
        expect(setLeagues).toHaveBeenCalledWith(9, { ligaIds: [5, 2], cupLigaIds: [2] }),
      );
    });

    it("keeps a cleared cup flag when a refilter brings the liga back", async () => {
      discover.mockResolvedValue([
        { ligaId: 3, ligaNr: null, name: "Kreispokal Herren", skName: "Pokal", akName: "Senioren", geschlecht: "männlich", vorabliga: false, alreadyTracked: false, conflictSeasonName: null, isCup: true },
      ]);
      render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
      await screen.findByText("Kreispokal Herren");
      fireEvent.click(screen.getByRole("checkbox", { name: "Kreispokal Herren" }));
      fireEvent.click(screen.getByRole("checkbox", { name: `${CUP}: Kreispokal Herren` }));

      fireEvent.click(screen.getByLabelText("settings.seasons.wizard.ownClubOnly"));
      await waitFor(() => expect(discover).toHaveBeenCalledTimes(2));
      await screen.findByText("Kreispokal Herren");

      expect(screen.getByRole("checkbox", { name: `${CUP}: Kreispokal Herren` })).not.toBeChecked();
    });
  });
});
