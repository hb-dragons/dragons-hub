import { describe, expect, it } from "vitest";
import { renderPushTemplate } from "./index";

// These payloads mirror exactly what the emit sites publish:
//   - referee-assignment.service.ts (manual assign/unassign on refereeGames)
//   - referees.sync.ts (sync reassignment on matchReferees)
// The push templates MUST render from these real fields. The previous templates
// read `slot`, `matchId`, `kickoffDate`, `kickoffTime`, `eventId` that the events
// never carried, so every referee push rendered "undefined" and the date helper
// threw. This test guards the producer<->template contract end to end.

const assignedPayload = {
  matchNo: 42,
  homeTeam: "Dragons U16",
  guestTeam: "TSV Neustadt",
  refereeName: "Max Muster",
  role: "SR1",
  teamIds: [] as number[],
  matchId: 7,
  refereeId: 3,
  kickoffDate: "2026-04-30",
  kickoffTime: "14:00:00",
  deepLink: "/referee-game/55",
};

const reassignedPayload = {
  matchNo: 42,
  homeTeam: "Dragons U16",
  guestTeam: "TSV Neustadt",
  oldRefereeName: "Max Muster",
  newRefereeName: "Erika Beispiel",
  role: "SR1",
  oldRefereeId: 3,
  newRefereeId: 4,
  teamIds: [] as number[],
  deepLink: "/referee-game/55",
};

describe("referee push contract (real emitted payloads)", () => {
  it("referee.assigned renders without 'undefined', with role, kickoff, deepLink and injected eventId", () => {
    const out = renderPushTemplate({
      eventType: "referee.assigned",
      payload: assignedPayload,
      locale: "de",
      eventId: "evt_assigned_1",
    });
    expect(out).not.toBeNull();
    expect(out!.body).not.toContain("undefined");
    expect(out!.body).toContain("SR1");
    expect(out!.body).toContain("Dragons U16");
    expect(out!.body).toContain("TSV Neustadt");
    expect(out!.body).toContain("30.04.2026");
    expect(out!.body).toContain("14:00");
    expect(out!.data.deepLink).toBe("/referee-game/55");
    expect(out!.data.eventType).toBe("referee.assigned");
    expect(out!.data.eventId).toBe("evt_assigned_1");
  });

  it("referee.assigned still renders cleanly when kickoff is absent (sync path)", () => {
    const { kickoffDate, kickoffTime, deepLink, ...noKickoff } = assignedPayload;
    void kickoffDate;
    void kickoffTime;
    void deepLink;
    const out = renderPushTemplate({
      eventType: "referee.assigned",
      payload: noKickoff,
      locale: "de",
      eventId: "evt_assigned_2",
    });
    expect(out).not.toBeNull();
    expect(out!.body).not.toContain("undefined");
    expect(out!.body).toContain("SR1");
    // No deepLink in payload -> safe fallback, never "/referee-game/undefined"
    expect(out!.data.deepLink).not.toContain("undefined");
  });

  it("referee.unassigned renders without 'undefined', with role, deepLink and injected eventId", () => {
    const out = renderPushTemplate({
      eventType: "referee.unassigned",
      payload: assignedPayload,
      locale: "de",
      eventId: "evt_unassigned_1",
    });
    expect(out).not.toBeNull();
    expect(out!.body).not.toContain("undefined");
    expect(out!.body).toContain("SR1");
    expect(out!.data.deepLink).toBe("/referee-game/55");
    expect(out!.data.eventType).toBe("referee.unassigned");
    expect(out!.data.eventId).toBe("evt_unassigned_1");
  });

  it("referee.reassigned renders without 'undefined', with role, deepLink and injected eventId", () => {
    const out = renderPushTemplate({
      eventType: "referee.reassigned",
      payload: reassignedPayload,
      locale: "de",
      eventId: "evt_reassigned_1",
    });
    expect(out).not.toBeNull();
    expect(out!.body).not.toContain("undefined");
    expect(out!.body).toContain("SR1");
    expect(out!.body).toContain("Max Muster");
    expect(out!.body).toContain("Erika Beispiel");
    expect(out!.data.deepLink).toBe("/referee-game/55");
    expect(out!.data.eventType).toBe("referee.reassigned");
    expect(out!.data.eventId).toBe("evt_reassigned_1");
  });
});
