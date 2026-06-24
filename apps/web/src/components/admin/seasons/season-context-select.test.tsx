// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SeasonContextSelect } from "./season-context-select";

vi.mock("swr", () => ({ default: () => ({ data: [
  { id: 1, name: "2025/26", status: "active" }, { id: 2, name: "2026/27", status: "upcoming" },
] }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

describe("SeasonContextSelect", () => {
  it("renders an option per season", () => {
    render(<SeasonContextSelect value={1} onChange={() => {}} />);
    expect(screen.getByText("2025/26")).toBeInTheDocument();
    expect(screen.getByText("2026/27")).toBeInTheDocument();
  });
});
