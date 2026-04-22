// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CoverageKPICards } from "./coverage-kpi-cards";
import en from "@/messages/en.json";

afterEach(cleanup);

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("CoverageKPICards", () => {
  it("shows percentage, filled/obligated, games, refs", () => {
    render(
      wrap(
        <CoverageKPICards
          kpis={{
            games: 53,
            distinctReferees: 20,
            obligatedSlots: 50,
            filledSlots: 42,
            unfilledSlots: 8,
            cancelled: 0,
            forfeited: 0,
          }}
        />,
      ),
    );
    expect(screen.getByText(/84%/)).toBeInTheDocument();
    expect(screen.getByText(/42.*50/)).toBeInTheDocument();
    expect(screen.getByText("53")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("renders em-dash when obligatedSlots is 0", () => {
    render(
      wrap(
        <CoverageKPICards
          kpis={{
            games: 5,
            distinctReferees: 3,
            obligatedSlots: 0,
            filledSlots: 0,
            unfilledSlots: 0,
            cancelled: 0,
            forfeited: 0,
          }}
        />,
      ),
    );
    expect(screen.getByTestId("coverage-value")).toHaveTextContent("—");
  });
});
