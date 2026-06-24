// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  api: { seasons: { activate: vi.fn(), list: vi.fn() } },
}));

describe("SeasonsList", () => {
  it("renders each season with its status", () => {
    render(<SeasonsList />);
    expect(screen.getByText(/2025\/26/)).toBeInTheDocument();
    expect(screen.getByText(/2026\/27/)).toBeInTheDocument();
  });
});
