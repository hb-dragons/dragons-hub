// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkloadBar } from "./workload-bar";

afterEach(() => {
  cleanup();
});

describe("WorkloadBar", () => {
  it("fills proportional to total/max, clamped [0,1]", () => {
    render(<WorkloadBar total={5} max={10} />);
    const fill = screen.getByTestId("workload-bar-fill");
    expect(fill.style.width).toBe("50%");
  });

  it("renders 100% for top entry", () => {
    render(<WorkloadBar total={10} max={10} />);
    expect(screen.getByTestId("workload-bar-fill").style.width).toBe("100%");
  });

  it("renders 0% when max is 0", () => {
    render(<WorkloadBar total={0} max={0} />);
    expect(screen.getByTestId("workload-bar-fill").style.width).toBe("0%");
  });
});
