// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const swr = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("swr", () => ({ default: () => ({ data: swr.data }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

import { SeasonContextSelect, normalizeSeasonPick } from "./season-context-select";

const ACTIVE = { id: 1, name: "2025/26", status: "active" };
const UPCOMING = { id: 2, name: "2026/27", status: "upcoming" };

describe("SeasonContextSelect", () => {
  beforeEach(() => {
    swr.data = [ACTIVE, UPCOMING];
  });
  afterEach(cleanup);

  it("shows the active season when no season is explicitly chosen", () => {
    // `undefined` is "whatever the API considers active" — the control still has
    // to name that season, or the header reads as though nothing is selected.
    render(<SeasonContextSelect value={undefined} onChange={() => {}} />);

    expect(screen.getByRole("combobox")).toHaveTextContent("2025/26");
  });

  it("shows the chosen season when one is named", () => {
    render(<SeasonContextSelect value={2} onChange={() => {}} />);

    expect(screen.getByRole("combobox")).toHaveTextContent("2026/27");
  });

  it("renders nothing when there is only one season to look at", () => {
    swr.data = [ACTIVE];
    const { container } = render(<SeasonContextSelect value={undefined} onChange={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before the season list arrives", () => {
    swr.data = undefined;
    const { container } = render(<SeasonContextSelect value={undefined} onChange={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("normalizeSeasonPick", () => {
  it("reports the active season as no explicit choice", () => {
    expect(normalizeSeasonPick(1, 1)).toBeUndefined();
  });

  it("keeps any other season as an explicit choice", () => {
    expect(normalizeSeasonPick(2, 1)).toBe(2);
  });

  it("keeps the pick when no season is active at all", () => {
    // Mid-onboarding there may be only upcoming seasons; the pick must still
    // scope the view rather than silently falling back to "active".
    expect(normalizeSeasonPick(2, undefined)).toBe(2);
  });
});
