// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubscribeButton } from "./subscribe-button";

const translations = {
  subscribe: "Abonnieren",
  subscribeTitle: "Kalender abonnieren",
  copy: "Kopieren",
  copied: "Kopiert",
  instructionApple: "apple",
  instructionGoogle: "google",
  instructionOutlook: "outlook",
};

function shownUrl(teamApiIds: number[]): URL {
  render(<SubscribeButton teamApiIds={teamApiIds} translations={translations} />);
  fireEvent.click(screen.getByRole("button", { name: /Abonnieren/ }));
  return new URL(document.querySelector("code")?.textContent ?? "");
}

describe("<SubscribeButton>", () => {
  afterEach(cleanup);

  it("offers the club-wide feed when no squad is selected", () => {
    const url = shownUrl([]);
    expect(url.pathname).toBe("/public/schedule.ics");
    expect(url.searchParams.has("teamApiId")).toBe(false);
  });

  it("repeats teamApiId once per selected squad", () => {
    expect(shownUrl([12, 34]).searchParams.getAll("teamApiId")).toEqual(["12", "34"]);
  });
});
