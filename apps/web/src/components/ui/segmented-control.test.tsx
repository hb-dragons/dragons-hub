// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "./segmented-control";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
] as const;

function renderControl(value: "a" | "b" | "c" = "a") {
  const onChange = vi.fn();
  render(<SegmentedControl label="Letters" value={value} options={[...OPTIONS]} onChange={onChange} />);
  return onChange;
}

describe("SegmentedControl", () => {
  it("is a labelled radio group with the current choice checked", () => {
    renderControl("b");
    expect(screen.getByRole("radiogroup", { name: "Letters" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveAttribute("aria-checked", "false");
  });

  it("puts only the checked choice in the tab order", () => {
    renderControl("b");
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveAttribute("tabindex", "-1");
  });

  it("reports a clicked choice", () => {
    const onChange = renderControl();
    fireEvent.click(screen.getByRole("radio", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("moves the choice with the arrow keys, wrapping at both ends, and ignores other keys", () => {
    const onChange = renderControl("a");
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("b");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("b");
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    onChange.mockClear();
    fireEvent.keyDown(group, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves focus along with the choice", () => {
    renderControl("a");
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveFocus();
  });
});
