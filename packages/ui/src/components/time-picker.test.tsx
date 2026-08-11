// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { TimePicker } from "./time-picker";

afterEach(cleanup);

function getInput() {
  // type="time" has no accessible role in happy-dom, so address it by slot.
  const input = document.querySelector<HTMLInputElement>(
    '[data-slot="time-picker"]',
  );
  if (!input) throw new Error("time-picker input not rendered");
  return input;
}

describe("TimePicker", () => {
  it("renders a null value as an empty controlled input rather than uncontrolled", () => {
    render(<TimePicker value={null} onChange={vi.fn()} />);
    expect(getInput()).toHaveValue("");
  });

  it("renders a value straight through", () => {
    render(<TimePicker value="19:30" onChange={vi.fn()} />);
    expect(getInput()).toHaveValue("19:30");
  });

  it("reports a cleared field as null, not an empty string", () => {
    const onChange = vi.fn();
    render(<TimePicker value="19:30" onChange={onChange} />);
    fireEvent.change(getInput(), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("reports a picked time as a string", () => {
    const onChange = vi.fn();
    render(<TimePicker value={null} onChange={onChange} />);
    fireEvent.change(getInput(), { target: { value: "20:15" } });
    expect(onChange).toHaveBeenCalledWith("20:15");
  });

  // Added in bd020866 — the disabled prop has to reach the DOM *and* carry the
  // not-allowed cursor, because the styling is what tells the user why nothing
  // happens when they click.
  describe("disabled", () => {
    it("disables the underlying input", () => {
      render(<TimePicker value="19:30" onChange={vi.fn()} disabled />);
      expect(getInput()).toBeDisabled();
    });

    it("carries the disabled cursor and dimming utilities", () => {
      render(<TimePicker value="19:30" onChange={vi.fn()} disabled />);
      const className = getInput().className;
      expect(className).toContain("disabled:cursor-not-allowed");
      expect(className).toContain("disabled:opacity-50");
    });

    it("is enabled by default", () => {
      render(<TimePicker value="19:30" onChange={vi.fn()} />);
      expect(getInput()).not.toBeDisabled();
    });
  });

  it("takes an id so a label can name the control", () => {
    render(
      <>
        <label htmlFor="tipoff">Anwurf</label>
        <TimePicker id="tipoff" value="19:30" onChange={vi.fn()} />
      </>,
    );
    expect(screen.getByLabelText("Anwurf")).toBe(getInput());
  });

  it("lets a caller-supplied class override the built-in height", () => {
    render(<TimePicker value={null} onChange={vi.fn()} className="h-10" />);
    expect(getInput().className).toContain("h-10");
    expect(getInput().className).not.toContain("h-8");
  });
});
