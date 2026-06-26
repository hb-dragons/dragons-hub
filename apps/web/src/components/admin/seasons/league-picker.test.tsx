// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { leagueTeams } = vi.hoisted(() => ({ leagueTeams: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { seasons: { leagueTeams } } }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

import { LeaguePicker } from "./league-picker";
import type { BrowsableLeague } from "@dragons/shared";

const LEAGUES: BrowsableLeague[] = [
  { ligaId: 1, ligaNr: null, name: "Landesliga Herren 2", skName: "Landesliga", akName: "Senioren", geschlecht: "männlich", vorabliga: true, alreadyTracked: false },
  { ligaId: 2, ligaNr: null, name: "Landesliga Damen 2", skName: "Landesliga", akName: "Senioren", geschlecht: "weiblich", vorabliga: true, alreadyTracked: false },
];

function renderPicker(props: Partial<React.ComponentProps<typeof LeaguePicker>> = {}) {
  const onToggle = vi.fn();
  render(
    <LeaguePicker
      leagues={LEAGUES}
      selected={new Set<number>()}
      onToggle={onToggle}
      filter=""
      onFilterChange={() => {}}
      ownClubOnly
      onOwnClubOnlyChange={() => {}}
      loading={false}
      {...props}
    />,
  );
  return { onToggle };
}

beforeEach(() => {
  vi.clearAllMocks();
  leagueTeams.mockResolvedValue({ teams: [{ teamPermanentId: 9, name: "Hanover Dragons I", clubId: 4121, isOwnClub: true }] });
});
afterEach(cleanup);

describe("LeaguePicker", () => {
  it("toggles a league when its checkbox is clicked", () => {
    const { onToggle } = renderPicker();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(onToggle).toHaveBeenCalledWith(1, true);
  });

  it("filters by search query", () => {
    renderPicker({ filter: "damen" });
    expect(screen.queryByText("Landesliga Herren 2")).not.toBeInTheDocument();
    expect(screen.getByText("Landesliga Damen 2")).toBeInTheDocument();
  });

  it("lazy-loads and shows a league's teams when expanded", async () => {
    renderPicker();
    fireEvent.click(screen.getAllByText("settings.seasons.wizard.showTeams")[0]!);
    expect(await screen.findByText("Hanover Dragons I")).toBeInTheDocument();
    expect(leagueTeams).toHaveBeenCalledWith(1);
  });
});
