// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import de from "@/messages/de.json";

vi.mock("swr", () => ({
  default: (key: string) => ({
    data:
      key === "/admin/venues"
        ? [{ id: 7, name: "Gymnasium Goetheschule" }]
        : [
            {
              venueId: 7,
              venueName: "Gymnasium Goetheschule",
              date: "2026-11-14",
              windowStart: "17:30:00",
              windowEnd: "20:00:00",
              games: [
                {
                  matchId: 501,
                  kickoffTime: "18:00:00",
                  endTime: "20:00:00",
                  homeTeam: "Dragons U16",
                  homeTeamCustomName: null,
                  homeBadgeColor: null,
                  guestTeam: "TSV Gast",
                  leagueName: "Oberliga",
                },
              ],
              hallTime: { kind: "open", startTime: "17:00", endTime: "21:00", note: null },
              coverage: "partial",
              gapBeforeMinutes: 0,
              gapAfterMinutes: 15,
            },
          ],
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));
vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { HallOccupancyTable } from "./hall-occupancy-table";

afterEach(cleanup);

describe("HallOccupancyTable accessibility", () => {
  // The repo has no axe runner; this asserts the structure axe would check:
  // labelled filter controls, column headers and named links.
  it("labels its filters, headers and links", () => {
    render(
      <NextIntlClientProvider
        locale="de"
        timeZone="Europe/Berlin"
        messages={de}
        formats={{
          dateTime: {
            matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" },
            matchTime: { hour: "2-digit", minute: "2-digit" },
          },
        }}
      >
        <HallOccupancyTable />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("combobox", { name: de.hallOccupancy.filters.hall })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: de.hallOccupancy.filters.coverage })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(0);
    for (const header of screen.getAllByRole("columnheader")) {
      expect(header).toHaveTextContent(/\S/);
    }
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAccessibleName();
    }
    expect(screen.queryByRole("button", { name: "" })).toBeNull();
  });
});
