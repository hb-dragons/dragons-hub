// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  it("offers the leagues the referee games span as league filters", () => {
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
    expect(screen.getByLabelText("U12 Kreisliga")).toBeInTheDocument();
  });
});
