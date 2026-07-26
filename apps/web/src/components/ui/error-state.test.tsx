// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";


vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";

afterEach(cleanup);

describe("<ErrorState>", () => {
  it("announces itself as an alert so it is distinguishable from an empty state", () => {
    render(<ErrorState onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("always renders a retry affordance and invokes it on click", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: /tryAgain/i });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("falls back to the shared errors.* copy and allows an override", () => {
    const { rerender } = render(<ErrorState onRetry={() => {}} />);
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("description")).toBeInTheDocument();

    rerender(<ErrorState onRetry={() => {}} title="Boom" description="Nope" />);
    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.getByText("Nope")).toBeInTheDocument();
  });
});

describe("<LoadingState>", () => {
  it("exposes a busy status role so loading is not mistaken for empty", () => {
    render(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("renders the requested number of placeholder rows", () => {
    const { container } = render(<LoadingState rows={4} />);
    expect(container.querySelectorAll('[data-slot="loading-row"]')).toHaveLength(4);
  });
});
