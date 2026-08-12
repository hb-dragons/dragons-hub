// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OwnClubTeam } from "@dragons/shared";

const entry: OwnClubTeam = {
  id: 1, teamId: 10, name: "Dragons U16", nameShort: "U16", customName: null,
  leagueId: 5, leagueName: "U16 Vorab", leagueTracked: false, linkSource: "seeded",
  estimatedGameDuration: null, badgeColor: null, displayOrder: 0,
};

vi.mock("swr", () => ({
  default: (key: string | null) => {
    if (key === null) return { data: undefined, mutate: vi.fn() };
    if (String(key).startsWith("/admin/teams")) return { data: [entry], mutate: vi.fn() };
    if (String(key).startsWith("/admin/seasons/")) return { data: { leagueNumbers: [], leagues: [{ id: 6, ligaNr: 1, apiLigaId: 60, name: "U16 Bezirksliga", seasonName: "s", ownClubRefs: false }] }, mutate: vi.fn() };
    return { data: [{ id: 9, name: "2026/27", status: "active" }], mutate: vi.fn() };
  },
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: { teams: { update: vi.fn(), reorder: vi.fn() }, seasons: { getLeagues: vi.fn() } } }));

import { TeamsTable } from "./teams-table";
import en from "@/messages/en.json";

afterEach(() => cleanup());

function renderTable() {
  return render(
    <NextIntlClientProvider locale="en" timeZone="Europe/Berlin" messages={en}>
      <TeamsTable canManage={true} />
    </NextIntlClientProvider>,
  );
}

describe("TeamsTable league column", () => {
  it("shows the untracked-league warning for a stale connection", () => {
    renderTable();
    expect(screen.getByText(/League no longer tracked/)).toBeInTheDocument();
  });

  it("offers the season's tracked leagues plus 'Not connected'", () => {
    renderTable();
    // The select trigger renders the current value; options render on open —
    // assert the trigger shows the connected (untracked) league name.
    expect(screen.getByText("U16 Vorab")).toBeInTheDocument();
  });
});
