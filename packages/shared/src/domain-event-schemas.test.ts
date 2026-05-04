import { describe, expect, it } from "vitest";
import { EVENT_TYPES, validateEventPayload } from "./index";

describe("validateEventPayload", () => {
  it("accepts a well-formed match.created payload", () => {
    const r = validateEventPayload(EVENT_TYPES.MATCH_CREATED, {
      matchNo: 42,
      homeTeam: "Dragons",
      guestTeam: "Titans",
      leagueId: 1,
      leagueName: "Kreisliga",
      kickoffDate: "2026-04-25",
      kickoffTime: "18:00",
      venueId: 5,
      venueName: "Arena",
      teamIds: [10, 11],
    });
    expect(r.valid).toBe(true);
  });

  it("rejects a match.created payload missing required fields", () => {
    const r = validateEventPayload(EVENT_TYPES.MATCH_CREATED, {
      matchNo: 42,
      homeTeam: "Dragons",
    });
    expect(r.valid).toBe(false);
    expect(r.issues).toBeDefined();
    expect(r.issues!.length).toBeGreaterThan(0);
  });

  it("accepts a referee-slots payload", () => {
    const r = validateEventPayload(EVENT_TYPES.REFEREE_SLOTS_NEEDED, {
      matchId: 1,
      matchNo: 42,
      homeTeam: "Dragons",
      guestTeam: "Titans",
      leagueId: 1,
      leagueName: "Kreisliga",
      kickoffDate: "2026-04-25",
      kickoffTime: "18:00",
      venueId: null,
      venueName: null,
      sr1Open: true,
      sr2Open: false,
      sr1Assigned: null,
      sr2Assigned: "Hans",
      deepLink: "/admin/referee-games",
    });
    expect(r.valid).toBe(true);
  });

  it("accepts a task.assigned payload with normal priority", () => {
    const r = validateEventPayload(EVENT_TYPES.TASK_ASSIGNED, {
      taskId: 1,
      boardId: 1,
      boardName: "Tasks",
      title: "Do the thing",
      assigneeUserIds: ["u1", "u2"],
      assignedBy: "Alice",
      dueDate: null,
      priority: "normal",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects task.assigned with bad priority", () => {
    const r = validateEventPayload(EVENT_TYPES.TASK_ASSIGNED, {
      taskId: 1,
      boardId: 1,
      boardName: "Tasks",
      title: "Do the thing",
      assigneeUserIds: ["u1"],
      assignedBy: "Alice",
      dueDate: null,
      priority: "urgent",
    });
    expect(r.valid).toBe(false);
  });

  it("override.conflict accepts both `field`/`overrideValue` and the legacy `fieldName`/`localValue` shape", () => {
    const a = validateEventPayload(EVENT_TYPES.OVERRIDE_CONFLICT, {
      matchNo: 1,
      homeTeam: "A",
      guestTeam: "B",
      field: "kickoffDate",
      overrideValue: "2026-04-25",
      remoteValue: "2026-04-26",
    });
    expect(a.valid).toBe(true);
    const b = validateEventPayload(EVENT_TYPES.OVERRIDE_CONFLICT, {
      matchNo: 1,
      homeTeam: "A",
      guestTeam: "B",
      fieldName: "kickoffDate",
      localValue: "2026-04-25",
      newRemoteValue: "2026-04-26",
    });
    expect(b.valid).toBe(true);
  });
});
