// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Column, Row } from "@tanstack/react-table";
import type { DateRange } from "@dragons/ui/components/calendar";

vi.mock("swr", () => ({
  default: () => ({ data: undefined, mutate: vi.fn() }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("./match-edit-sheet", () => ({ MatchEditSheet: () => null }));

import { dateRangeFilterFn } from "./match-list-table";
import { DataTableDateFilter } from "@/components/ui/data-table-date-filter";
import type { MatchListItem } from "./types";

/**
 * Both the trigger label and the rows have to agree in every timezone, so none
 * of these tests may run under Europe/Berlin — that is the one zone in which
 * the old `toISOString().slice(0, 10)` happened to be off by exactly the
 * amount nobody notices. `vi.stubEnv` is used deliberately: assigning
 * `process.env.TZ` back to a previously-unset value stores the string
 * "undefined" and leaves the worker in UTC for every later test.
 */
const ZONES = ["UTC", "America/New_York", "Pacific/Kiritimati"];

const formats = {
  dateTime: {
    short: { day: "2-digit", month: "2-digit", year: "numeric" },
  },
} as const;

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function admits(range: DateRange, day: string): boolean {
  const row = { getValue: () => day } as unknown as Row<MatchListItem>;
  return dateRangeFilterFn(row, "kickoffDate", range, () => undefined);
}

/** Renders the filter's trigger and returns the days it names, as YYYY-MM-DD. */
function triggerDays(range: DateRange): string[] {
  const column = {
    getFilterValue: () => range,
    setFilterValue: vi.fn(),
  } as unknown as Column<MatchListItem, unknown>;

  render(
    <NextIntlClientProvider
      locale="de"
      timeZone="Europe/Berlin"
      messages={{ common: { reset: "Reset" } }}
      formats={formats}
    >
      <DataTableDateFilter column={column} title="Datum" />
    </NextIntlClientProvider>,
  );

  const label = screen.getByRole("button").textContent ?? "";
  return [...label.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)].map(
    (m) => `${m[3]}-${m[2]}-${m[1]}`,
  );
}

describe("match date-range filter", () => {
  it("passes every row through when no range is set", () => {
    expect(admits(undefined as unknown as DateRange, "2026-07-26")).toBe(true);
  });

  it.each(ZONES)("keeps both end days of the picked range (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    // What react-day-picker hands back: local midnight of each clicked day.
    const range: DateRange = { from: new Date(2026, 6, 26), to: new Date(2026, 6, 28) };

    expect(admits(range, "2026-07-25")).toBe(false);
    expect(admits(range, "2026-07-26")).toBe(true);
    expect(admits(range, "2026-07-27")).toBe(true);
    expect(admits(range, "2026-07-28")).toBe(true);
    expect(admits(range, "2026-07-29")).toBe(false);
  });

  it.each(ZONES)("admits exactly the days its trigger label names (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    const range: DateRange = { from: new Date(2026, 6, 26), to: new Date(2026, 6, 28) };

    const [labelFrom, labelTo] = triggerDays(range);
    expect(labelFrom).toBe("2026-07-26");
    expect(labelTo).toBe("2026-07-28");

    expect(admits(range, labelFrom!)).toBe(true);
    expect(admits(range, labelTo!)).toBe(true);
  });

  it.each(ZONES)("handles an open-ended range on both sides (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    const fromOnly: DateRange = { from: new Date(2026, 0, 1), to: undefined };
    expect(admits(fromOnly, "2025-12-31")).toBe(false);
    expect(admits(fromOnly, "2026-01-01")).toBe(true);

    const toOnly = { from: undefined, to: new Date(2026, 0, 1) } as unknown as DateRange;
    expect(admits(toOnly, "2026-01-01")).toBe(true);
    expect(admits(toOnly, "2026-01-02")).toBe(false);
  });

  it("renders a single-ended label that still matches the filter", () => {
    vi.stubEnv("TZ", "UTC");
    const range: DateRange = { from: new Date(2026, 6, 26), to: undefined };
    expect(triggerDays(range)).toEqual(["2026-07-26"]);
    expect(admits(range, "2026-07-26")).toBe(true);
  });
});
