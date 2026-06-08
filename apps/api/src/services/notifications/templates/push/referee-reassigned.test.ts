import { describe, expect, it } from "vitest";
import { renderRefereeReassignedPush } from "./referee-reassigned";
import { BODY_MAX, TITLE_MAX } from "./types";

const payload = {
  matchId: 123,
  matchNo: 42,
  homeTeam: "Dragons U16",
  guestTeam: "TSV Neustadt",
  oldRefereeName: "Max Muster",
  newRefereeName: "Erika Beispiel",
  role: "SR1",
  deepLink: "/referee-game/123",
};

describe("renderRefereeReassignedPush", () => {
  it("renders German output", () => {
    const out = renderRefereeReassignedPush(payload, "de");
    expect(out.title).toContain("übertragen");
    expect(out.body).toContain("Dragons U16");
    expect(out.body).toContain("TSV Neustadt");
    expect(out.body).toContain("SR1");
    expect(out.body).not.toContain("undefined");
    expect(out.data.deepLink).toBe("/referee-game/123");
    expect(out.data.eventType).toBe("referee.reassigned");
  });

  it("renders English output", () => {
    const out = renderRefereeReassignedPush(payload, "en");
    expect(out.title.toLowerCase()).toContain("reassigned");
    expect(out.body).toContain("Dragons U16");
    expect(out.body).toContain("TSV Neustadt");
  });

  it("respects title and body length limits", () => {
    const longPayload = {
      ...payload,
      homeTeam: "X".repeat(80),
      guestTeam: "Y".repeat(80),
    };
    const out = renderRefereeReassignedPush(longPayload, "de");
    expect(out.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(out.body.length).toBeLessThanOrEqual(BODY_MAX);
  });

  it("returns JSON-serializable data payload", () => {
    const out = renderRefereeReassignedPush(payload, "de");
    expect(() => JSON.stringify(out.data)).not.toThrow();
  });
});
