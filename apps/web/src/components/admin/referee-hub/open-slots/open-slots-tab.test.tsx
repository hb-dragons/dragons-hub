// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import useSWR from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { OpenSlotsTab } from "./open-slots-tab";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/referees",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn() };
});

afterEach(cleanup);

describe("OpenSlotsTab", () => {
  it("offers the leagues the referee games span as league filters", async () => {
    const keys: unknown[] = [];
    vi.mocked(useSWR).mockImplementation((key: unknown) => {
      keys.push(key);
      if (key === SWR_KEYS.refereeGameLeagues) {
        return {
          data: { leagues: [{ apiLigaId: 101, name: "U12 Kreisliga", short: "RKu12mo" }] },
        } as never;
      }
      return { data: { items: [], total: 0, hasMore: false }, isLoading: false } as never;
    });

    render(<OpenSlotsTab />);

    expect(keys).toContain(SWR_KEYS.refereeGameLeagues);
    expect(keys).not.toContain(SWR_KEYS.settingsLeagues);
    fireEvent.pointerDown(screen.getByRole("button", { name: "league" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitemcheckbox", { name: /U12 Kreisliga/ })).toBeInTheDocument();
  });

  it("lays out the toolbar, the agenda, and no sheet until a game is picked", () => {
    vi.mocked(useSWR).mockReturnValue({ data: { items: [], total: 0, hasMore: false }, isLoading: false } as never);

    render(<OpenSlotsTab />);

    expect(screen.getByRole("radiogroup", { name: "status" })).toBeInTheDocument();
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
