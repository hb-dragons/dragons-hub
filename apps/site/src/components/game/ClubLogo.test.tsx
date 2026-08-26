// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ClubLogo } from "./ClubLogo";

afterEach(cleanup);

describe("ClubLogo", () => {
  it("renders the club asset for an opponent", () => {
    render(<ClubLogo clubId={1026} isOwnClub={false} alt="1. BC Bremerhaven" />);
    const img = screen.getByAltText("1. BC Bremerhaven");
    expect(img).toHaveAttribute("src", expect.stringContaining("/public/assets/clubs/1026.webp"));
  });

  it("renders the club logo for our own team", () => {
    render(<ClubLogo clubId={42} isOwnClub alt="Dragons 1" />);
    expect(screen.getByAltText("Dragons 1")).toHaveAttribute("src", "/img/logo.svg");
  });

  // The API answers a missing club asset with a JSON 404, which the browser
  // blocks (ORB) — without a fallback the card shows a broken-image glyph (#264).
  it("swaps in the ball glyph when the asset fails to load", () => {
    render(<ClubLogo clubId={1026} isOwnClub={false} alt="1. BC Bremerhaven" />);
    fireEvent.error(screen.getByAltText("1. BC Bremerhaven"));

    expect(screen.queryByAltText("1. BC Bremerhaven")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1. BC Bremerhaven" })).toHaveTextContent("🏀");
  });
});
