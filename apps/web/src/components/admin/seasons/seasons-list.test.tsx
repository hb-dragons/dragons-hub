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
    // Only the upcoming season (id 2) shows the button.
    fireEvent.click(screen.getByText("settings.seasons.manage.button"));
    expect(await screen.findByText("manage-open:2")).toBeInTheDocument();
  });
});
