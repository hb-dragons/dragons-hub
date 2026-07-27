// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { DatePicker } from "./date-picker";

afterEach(cleanup);

function getTrigger() {
  return screen.getByRole("button", { name: /Datum|14\.03\.2026|\d{2}\./ });
}

describe("DatePicker", () => {
  it("shows the German display format for an ISO value", () => {
    render(<DatePicker value="2026-03-14" onChange={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent("14.03.2026");
  });

  it("falls back to the placeholder when there is no value", () => {
    render(<DatePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent("Datum wählen");
  });

  it("takes a custom placeholder", () => {
    render(
      <DatePicker value={null} onChange={vi.fn()} placeholder="Spieltag" />,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Spieltag");
  });

  it("dims the trigger only while it is showing a placeholder", () => {
    const { rerender } = render(<DatePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button").className).toContain(
      "text-muted-foreground",
    );
    rerender(<DatePicker value="2026-03-14" onChange={vi.fn()} />);
    expect(screen.getByRole("button").className).not.toContain(
      "text-muted-foreground",
    );
  });

  it("reports a picked day as an ISO date and closes the popover", () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-03-14" onChange={onChange} />);
    fireEvent.click(getTrigger());

    const day = screen.getByRole("button", { name: /20\..*M(ä|ae)rz 2026/i });
    fireEvent.click(day);

    expect(onChange).toHaveBeenCalledWith("2026-03-20");
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("reports a deselected day as null", () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-03-14" onChange={onChange} />);
    fireEvent.click(getTrigger());

    // Clicking the already-selected day in single mode deselects it.
    const day = screen.getByRole("button", { name: /14\..*M(ä|ae)rz 2026/i });
    fireEvent.click(day);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  // Added in bd020866. `disabled` has to do two things: stop the trigger being
  // pressable, and stop Popover's own onOpenChange from opening the calendar
  // through a keyboard path that bypasses the button's disabled state.
  describe("disabled", () => {
    it("disables the trigger button", () => {
      render(<DatePicker value="2026-03-14" onChange={vi.fn()} disabled />);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("does not open the calendar on click", () => {
      render(<DatePicker value="2026-03-14" onChange={vi.fn()} disabled />);
      fireEvent.click(screen.getByRole("button"));
      expect(screen.queryByRole("grid")).toBeNull();
    });

    it("carries the not-allowed cursor from the button variants", () => {
      render(<DatePicker value="2026-03-14" onChange={vi.fn()} disabled />);
      expect(screen.getByRole("button").className).toContain(
        "disabled:cursor-not-allowed",
      );
    });

    it("still opens when not disabled", () => {
      render(<DatePicker value="2026-03-14" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });
  });

  it("takes an id so a label can name the trigger", () => {
    render(
      <>
        <label htmlFor="matchday">Spieltag</label>
        <DatePicker id="matchday" value={null} onChange={vi.fn()} />
      </>,
    );
    expect(screen.getByLabelText("Spieltag")).toBe(screen.getByRole("button"));
  });
});
