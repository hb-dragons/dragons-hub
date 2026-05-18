// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RefereeList } from "./referee-list";

const refs = [
  { id: 1, apiId: 100, firstName: "Anna", lastName: "Müller", licenseNumber: 12345, matchCount: 14, roles: ["SR1", "SR2"], allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" },
  { id: 2, apiId: 101, firstName: "Karl", lastName: "Schmidt", licenseNumber: 33122, matchCount: 9, roles: ["SR1", "SR2"], allowAllHomeGames: false, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" },
];

vi.mock("swr", () => ({
  default: vi.fn(() => ({ data: { items: refs, total: 2 } })),
  mutate: vi.fn(),
}));

const fetchAPI = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api", () => ({ fetchAPI: (...args: unknown[]) => fetchAPI(...args), APIError: class extends Error {} }));

const messages = {
  refereeHub: {
    referees: {
      kpi: { total: "Total", refs: "Refs", workload: "Avg" },
      columns: { ref: "Referee", own: "Own", games: "Games" },
      search: "Search…",
      sort: { name: "Name", workloadDesc: "Games (desc)", workloadAsc: "Games (asc)" },
      empty: "No referees",
    },
  },
};

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

afterEach(() => { cleanup(); fetchAPI.mockClear(); });

describe("RefereeList", () => {
  it("renders referees", () => {
    render(wrap(<RefereeList selectedId={null} onSelect={vi.fn()} />));
    expect(screen.getByText(/Müller/)).toBeInTheDocument();
    expect(screen.getByText(/Schmidt/)).toBeInTheDocument();
  });

  it("invokes onSelect with referee id on row click", () => {
    const onSelect = vi.fn();
    render(wrap(<RefereeList selectedId={null} onSelect={onSelect} />));
    fireEvent.click(screen.getByText(/Müller/));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("fires PATCH on isOwnClub toggle click", async () => {
    render(wrap(<RefereeList selectedId={null} onSelect={vi.fn()} />));
    const toggles = screen.getAllByRole("checkbox", { name: /own/i });
    fireEvent.click(toggles[0]!);
    await waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(
      "/admin/referees/1",
      expect.objectContaining({ method: "PATCH" }),
    ));
  });
});
