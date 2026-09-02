// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { RadioGroup, RadioGroupItem } from "./radio-group";

afterEach(cleanup);

describe("RadioGroup", () => {
  it("reports the picked value and reflects the checked state", () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup value="a" onValueChange={onValueChange}>
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute("data-state", "unchecked");

    fireEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("renders a disabled item as not operable", () => {
    render(
      <RadioGroup value="a">
        <RadioGroupItem value="a" aria-label="A" disabled />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio", { name: "A" })).toBeDisabled();
  });
});
