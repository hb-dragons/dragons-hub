// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StatusChipRow } from "./status-chip-row";
import en from "@/messages/en.json";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

describe("StatusChipRow", () => {
  it("marks 'All' active when status is empty", () => {
    render(wrap(<StatusChipRow status={[]}
      counts={{ total: 10, played: 7, cancelled: 2, forfeited: 1 }}
      onChange={() => {}} />));
    expect(screen.getByTestId("chip-all")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("chip-played")).toHaveAttribute("data-active", "false");
  });

  it("click chip selects single-value status", () => {
    const onChange = vi.fn();
    render(wrap(<StatusChipRow status={[]}
      counts={{ total: 10, played: 7, cancelled: 2, forfeited: 1 }}
      onChange={onChange} />));
    fireEvent.click(screen.getByTestId("chip-cancelled"));
    expect(onChange).toHaveBeenCalledWith(["cancelled"]);
  });

  it("click active chip clears to empty", () => {
    const onChange = vi.fn();
    render(wrap(<StatusChipRow status={["cancelled"]}
      counts={{ total: 10, played: 7, cancelled: 2, forfeited: 1 }}
      onChange={onChange} />));
    fireEvent.click(screen.getByTestId("chip-cancelled"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
