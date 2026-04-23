import { describe, expect, it } from "vitest";
import { renderMatchRescheduledPush } from "./match-rescheduled";

const payload = {
  matchId: 777,
  homeTeam: "Dragons",
  guestTeam: "Tigers",
  kickoffDate: "2026-06-10",
  kickoffTime: "17:30",
  oldKickoffDate: "2026-06-08",
  oldKickoffTime: "18:00",
  eventId: "evt_resched_1",
};

describe("renderMatchRescheduledPush", () => {
  it("includes both new and old dates", () => {
    const out = renderMatchRescheduledPush(payload, "de");
    expect(out.body).toContain("10.06.2026");
    expect(out.body).toContain("08.06.2026");
    expect(out.data.eventType).toBe("match.rescheduled");
    expect(out.data.deepLink).toBe("/game/777");
  });

  it("renders English", () => {
    const out = renderMatchRescheduledPush(payload, "en");
    expect(out.body).toContain("2026-06-10");
    expect(out.body).toContain("2026-06-08");
  });
});
