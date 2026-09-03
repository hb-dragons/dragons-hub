import { describe, expect, it } from "vitest";
import { federationGameUrl } from "./referee-games";

describe("federationGameUrl", () => {
  it("points at the federation portal's game page for the spielplanId", () => {
    expect(federationGameUrl(2836773)).toBe(
      "https://www.basketball-bund.net/static/#/spiel/2836773",
    );
  });
});
