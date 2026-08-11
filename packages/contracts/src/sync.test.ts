import { describe, expect, it } from "vitest";
import {
  syncPaginationSchema,
  syncLogsQuerySchema,
  syncEntryIdParamSchema,
  syncEntriesQuerySchema,
  syncStreamParamSchema,
  syncJobStatusesQuerySchema,
  syncUpdateScheduleBodySchema,
  syncMatchChangesParamSchema,
  syncTypeQuerySchema,
  syncJobIdParamSchema,
} from "./sync";
import { SYNC_STATUSES } from "@dragons/shared";

describe("syncPaginationSchema", () => {
  it("applies defaults when empty", () => {
    expect(syncPaginationSchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it("coerces string values to numbers", () => {
    expect(syncPaginationSchema.parse({ limit: "10", offset: "5" })).toEqual({ limit: 10, offset: 5 });
  });

  it("rejects limit below 1", () => {
    expect(() => syncPaginationSchema.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit above 100", () => {
    expect(() => syncPaginationSchema.parse({ limit: 101 })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => syncPaginationSchema.parse({ offset: -1 })).toThrow();
  });
});

describe("syncLogsQuerySchema", () => {
  // Structural guard: the status enum must be derived from SYNC_STATUSES, not
  // restated. Adding a value to SYNC_STATUSES without it reaching the schema
  // fails here.
  it.each(SYNC_STATUSES)("accepts the shared sync status %s", (status) => {
    expect(syncLogsQuerySchema.parse({ status }).status).toBe(status);
  });

  it("rejects invalid status", () => {
    expect(() => syncLogsQuerySchema.parse({ status: "invalid" })).toThrow();
  });

  it("allows omitting status", () => {
    const result = syncLogsQuerySchema.parse({});
    expect(result.status).toBeUndefined();
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });
});

describe("syncEntryIdParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(syncEntryIdParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("rejects zero", () => {
    expect(() => syncEntryIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative numbers", () => {
    expect(() => syncEntryIdParamSchema.parse({ id: -1 })).toThrow();
  });
});

describe("syncEntriesQuerySchema", () => {
  it("accepts all entity types", () => {
    const types = ["league", "match", "standing", "team", "venue", "referee", "refereeRole"];
    for (const entityType of types) {
      expect(syncEntriesQuerySchema.parse({ entityType }).entityType).toBe(entityType);
    }
  });

  it("accepts all action types", () => {
    const actions = ["created", "updated", "skipped", "failed"];
    for (const action of actions) {
      expect(syncEntriesQuerySchema.parse({ action }).action).toBe(action);
    }
  });

  it("rejects invalid entity type", () => {
    expect(() => syncEntriesQuerySchema.parse({ entityType: "invalid" })).toThrow();
  });

  it("rejects invalid action", () => {
    expect(() => syncEntriesQuerySchema.parse({ action: "invalid" })).toThrow();
  });

  it("allows omitting both filters", () => {
    const result = syncEntriesQuerySchema.parse({});
    expect(result.entityType).toBeUndefined();
    expect(result.action).toBeUndefined();
  });

  it("combines pagination with filters", () => {
    const result = syncEntriesQuerySchema.parse({
      limit: "5",
      offset: "10",
      entityType: "match",
      action: "updated",
    });
    expect(result).toEqual({ limit: 5, offset: 10, entityType: "match", action: "updated" });
  });

  it("accepts search string", () => {
    const result = syncEntriesQuerySchema.parse({ search: "Dragons" });
    expect(result.search).toBe("Dragons");
  });

  it("strips empty search string", () => {
    const result = syncEntriesQuerySchema.parse({ search: "" });
    expect(result.search).toBeUndefined();
  });

  it("allows omitting search", () => {
    const result = syncEntriesQuerySchema.parse({});
    expect(result.search).toBeUndefined();
  });
});

describe("syncStreamParamSchema", () => {
  it("coerces string to positive integer", () => {
    expect(syncStreamParamSchema.parse({ id: "42" })).toEqual({ id: 42 });
  });

  it("rejects zero", () => {
    expect(() => syncStreamParamSchema.parse({ id: "0" })).toThrow();
  });

  it("rejects non-numeric strings", () => {
    expect(() => syncStreamParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("syncJobStatusesQuerySchema", () => {
  it("parses comma-separated valid statuses", () => {
    const result = syncJobStatusesQuerySchema.parse({ statuses: "active,failed" });
    expect(result.statuses).toEqual(["active", "failed"]);
  });

  it("filters out invalid statuses", () => {
    const result = syncJobStatusesQuerySchema.parse({ statuses: "active,bogus,failed" });
    expect(result.statuses).toEqual(["active", "failed"]);
  });

  it("returns undefined when statuses not provided", () => {
    expect(syncJobStatusesQuerySchema.parse({}).statuses).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(syncJobStatusesQuerySchema.parse({ statuses: "" }).statuses).toBeUndefined();
  });

  it("accepts all valid statuses", () => {
    const result = syncJobStatusesQuerySchema.parse({
      statuses: "active,waiting,delayed,completed,failed",
    });
    expect(result.statuses).toEqual(["active", "waiting", "delayed", "completed", "failed"]);
  });
});

describe("syncUpdateScheduleBodySchema", () => {
  it("accepts valid cron expression", () => {
    const result = syncUpdateScheduleBodySchema.parse({ cronExpression: "0 4 * * *" });
    expect(result.cronExpression).toBe("0 4 * * *");
  });

  it("rejects invalid cron expression", () => {
    expect(() => syncUpdateScheduleBodySchema.parse({ cronExpression: "invalid" })).toThrow();
  });

  it("rejects cron with wrong number of fields", () => {
    expect(() => syncUpdateScheduleBodySchema.parse({ cronExpression: "* * *" })).toThrow();
    expect(() => syncUpdateScheduleBodySchema.parse({ cronExpression: "* * * * * *" })).toThrow();
  });

  it("accepts all fields together", () => {
    const input = {
      enabled: false,
      cronExpression: "*/5 * * * *",
      timezone: "UTC",
    };
    expect(syncUpdateScheduleBodySchema.parse(input)).toEqual(input);
  });

  it("rejects a client-supplied updatedBy (audit actor is set server-side)", () => {
    // Strict schema: a field the server owns is a 400, not a silent strip.
    const result = syncUpdateScheduleBodySchema.safeParse({
      enabled: true,
      updatedBy: "attacker",
    });
    expect(result.success).toBe(false);
  });

  it("allows empty object", () => {
    const result = syncUpdateScheduleBodySchema.parse({});
    expect(result.enabled).toBeUndefined();
    expect(result.cronExpression).toBeUndefined();
    expect(result.timezone).toBeUndefined();
  });

  it("rejects empty timezone string", () => {
    expect(() => syncUpdateScheduleBodySchema.parse({ timezone: "" })).toThrow();
  });

  it("accepts complex cron expressions", () => {
    const expressions = ["0 0,12 * * 1-5", "*/15 * * * *", "0 4 1,15 * *"];
    for (const cronExpression of expressions) {
      expect(syncUpdateScheduleBodySchema.parse({ cronExpression }).cronExpression).toBe(cronExpression);
    }
  });
});

describe("syncTypeQuerySchema", () => {
  it("accepts the two sync types the pipeline writes", () => {
    expect(syncTypeQuerySchema.parse({ syncType: "full" }).syncType).toBe("full");
    expect(syncTypeQuerySchema.parse({ syncType: "referee-games" }).syncType).toBe("referee-games");
  });

  it("allows omitting syncType", () => {
    expect(syncTypeQuerySchema.parse({}).syncType).toBeUndefined();
  });

  // Deliberately not an enum: PUT /admin/sync/schedule takes an arbitrary
  // syncType in its body and upsertSchedule writes it, so the readable set is
  // open at runtime. Matches syncLogsQuerySchema.syncType, which is also free.
  it("accepts a syncType outside the two the pipeline writes", () => {
    expect(syncTypeQuerySchema.parse({ syncType: "some-future-type" }).syncType).toBe(
      "some-future-type",
    );
  });

  it("keeps an empty syncType as the empty string (the service reads it as no filter)", () => {
    expect(syncTypeQuerySchema.parse({ syncType: "" }).syncType).toBe("");
  });

  it("rejects a repeated syncType query param", () => {
    expect(syncTypeQuerySchema.safeParse({ syncType: ["full", "referee-games"] }).success).toBe(
      false,
    );
  });
});

describe("syncJobIdParamSchema", () => {
  it("accepts the opaque BullMQ job ids the queue hands out", () => {
    expect(syncJobIdParamSchema.parse({ jobId: "manual-sync" })).toEqual({ jobId: "manual-sync" });
    expect(syncJobIdParamSchema.parse({ jobId: "referee-games-sync-42" })).toEqual({
      jobId: "referee-games-sync-42",
    });
  });

  it("rejects an empty job id", () => {
    expect(() => syncJobIdParamSchema.parse({ jobId: "" })).toThrow();
  });

  it("rejects a missing job id", () => {
    expect(() => syncJobIdParamSchema.parse({})).toThrow();
  });
});

describe("syncMatchChangesParamSchema", () => {
  it("coerces string to positive integer", () => {
    expect(syncMatchChangesParamSchema.parse({ apiMatchId: "5001" })).toEqual({ apiMatchId: 5001 });
  });

  it("rejects zero", () => {
    expect(() => syncMatchChangesParamSchema.parse({ apiMatchId: 0 })).toThrow();
  });

  it("rejects negative numbers", () => {
    expect(() => syncMatchChangesParamSchema.parse({ apiMatchId: -1 })).toThrow();
  });

  it("rejects non-numeric strings", () => {
    expect(() => syncMatchChangesParamSchema.parse({ apiMatchId: "abc" })).toThrow();
  });
});
