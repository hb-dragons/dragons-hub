// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalendarSubscribe } from "./CalendarSubscribe";
import { strings } from "../../lib/strings";

afterEach(cleanup);

function open(squadIds: number[]) {
  render(<CalendarSubscribe apiBase="https://api.example" squadIds={squadIds} />);
  fireEvent.click(screen.getByRole("button", { name: strings.spielplan.subscribe }));
  return new URL(document.querySelector("code")?.textContent ?? "");
}

describe("CalendarSubscribe", () => {
  it("shows the club-wide feed URL without squads", () => {
    const url = open([]);
    expect(url.origin + url.pathname).toBe("https://api.example/public/schedule.ics");
    expect(url.searchParams.has("teamApiId")).toBe(false);
  });

  it("repeats teamApiId once per squad", () => {
    expect(open([160402, 320674]).searchParams.getAll("teamApiId")).toEqual(["160402", "320674"]);
  });

  it("copies the URL and confirms it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    open([160402]);
    fireEvent.click(screen.getByRole("button", { name: strings.spielplan.copy }));
    expect(writeText).toHaveBeenCalledWith(
      "https://api.example/public/schedule.ics?teamApiId=160402",
    );
    expect(await screen.findByRole("button", { name: strings.spielplan.copied })).toBeInTheDocument();
  });

  it("lists the per-app instructions", () => {
    open([]);
    expect(screen.getByText(strings.spielplan.instructionApple, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(strings.spielplan.instructionGoogle, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(strings.spielplan.instructionOutlook, { exact: false })).toBeInTheDocument();
  });
});
