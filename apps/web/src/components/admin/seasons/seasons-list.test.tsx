// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
afterEach(cleanup);
import { SeasonsList } from "./seasons-list";

vi.mock("swr", () => ({
  default: () => ({
    data: [
      { id: 1, name: "2025/26", status: "active", leagueCount: 3 },
      { id: 2, name: "2026/27", status: "upcoming", leagueCount: 0 },
      { id: 3, name: "2024/25", status: "archived", leagueCount: 5 },
    ],
  }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api", () => ({
  api: {
    seasons: { activate: vi.fn(), list: vi.fn(), create: vi.fn(), discover: vi.fn(), setLeagues: vi.fn() },
    sync: { trigger: vi.fn() },
  },
}));
vi.mock("./manage-leagues-dialog", () => ({
  ManageLeaguesDialog: ({ open, seasonId }: { open: boolean; seasonId: number }) =>
    open ? <div>manage-open:{seasonId}</div> : null,
}));

describe("SeasonsList", () => {
  it("renders each season with its status", () => {
    render(<SeasonsList />);
    expect(screen.getByText(/2025\/26/)).toBeInTheDocument();
    expect(screen.getByText(/2026\/27/)).toBeInTheDocument();
  });

  it("opens the manage-leagues dialog for the upcoming season", async () => {
    render(<SeasonsList />);
    fireEvent.click(screen.getAllByText("settings.seasons.manage.button")[1]!);
    expect(await screen.findByText("manage-open:2")).toBeInTheDocument();
  });

  it("lets the active season's leagues be managed too, but not activated again", async () => {
    render(<SeasonsList />);
    // Both live seasons offer the button; the archived one does not.
    expect(screen.getAllByText("settings.seasons.manage.button")).toHaveLength(2);
    expect(screen.getAllByText("settings.seasons.activate")).toHaveLength(1);
    fireEvent.click(screen.getAllByText("settings.seasons.manage.button")[0]!);
    expect(await screen.findByText("manage-open:1")).toBeInTheDocument();
  });
});
