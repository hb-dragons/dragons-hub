import { describe, expect, it } from "vitest";
import { renderMatchCancelledPush } from "./match-cancelled";

const payload = {
  matchId: 555,
  homeTeam: "Dragons",
  guestTeam: "Sharks",
  kickoffDate: "2026-06-01",
  kickoffTime: "18:00",
  eventId: "evt_cancel_1",
};

describe("renderMatchCancelledPush", () => {
  it("renders German", () => {
    const out = renderMatchCancelledPush(payload, "de");
    expect(out.title).toContain("abgesagt");
    expect(out.body).toContain("Dragons");
    expect(out.body).toContain("Sharks");
    expect(out.data.deepLink).toBe("/game/555");
    expect(out.data.eventType).toBe("match.cancelled");
  });

  it("renders English", () => {
    const out = renderMatchCancelledPush(payload, "en");
    expect(out.title.toLowerCase()).toContain("cancelled");
  });
});
