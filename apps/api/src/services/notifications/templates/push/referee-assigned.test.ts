import { describe, expect, it } from "vitest";
import { renderRefereeAssignedPush } from "./referee-assigned";
import { BODY_MAX, TITLE_MAX } from "./types";

const payload = {
  matchId: 123,
  matchNo: "0042",
  homeTeam: "Dragons U16",
  guestTeam: "TSV Neustadt",
  slot: "SR1" as const,
  kickoffDate: "2026-04-30",
  kickoffTime: "14:00",
  eventId: "evt_assigned_1",
};

describe("renderRefereeAssignedPush", () => {
  it("renders German output", () => {
    const out = renderRefereeAssignedPush(payload, "de");
    expect(out.title).toContain("Schiedsrichter");
    expect(out.body).toContain("Dragons U16");
    expect(out.body).toContain("TSV Neustadt");
    expect(out.body).toContain("SR1");
    expect(out.data.deepLink).toBe("/referee-game/123");
    expect(out.data.eventType).toBe("referee.assigned");
    expect(out.data.eventId).toBe("evt_assigned_1");
  });

  it("renders English output", () => {
    const out = renderRefereeAssignedPush(payload, "en");
    expect(out.title.toLowerCase()).toContain("referee");
    expect(out.body).toContain("Dragons U16");
    expect(out.body).toContain("TSV Neustadt");
  });

  it("respects title and body length limits", () => {
    const longPayload = {
      ...payload,
      homeTeam: "X".repeat(80),
      guestTeam: "Y".repeat(80),
    };
    const out = renderRefereeAssignedPush(longPayload, "de");
    expect(out.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(out.body.length).toBeLessThanOrEqual(BODY_MAX);
  });

  it("returns JSON-serializable data payload", () => {
    const out = renderRefereeAssignedPush(payload, "de");
    expect(() => JSON.stringify(out.data)).not.toThrow();
  });
});
