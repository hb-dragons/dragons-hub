import { describe, expect, it } from "vitest";
import {
  paginationSchema,
  syncLogsQuerySchema,
  syncEntryIdParamSchema,
  syncEntriesQuerySchema,
  syncStreamParamSchema,
  jobStatusesQuerySchema,
  updateScheduleBodySchema,
} from "./sync.schemas";

describe("paginationSchema", () => {
  it("applies defaults when empty", () => {
    expect(paginationSchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it("coerces string values to numbers", () => {
    expect(paginationSchema.parse({ limit: "10", offset: "5" })).toEqual({ limit: 10, offset: 5 });
  });

  it("rejects limit below 1", () => {
    expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit above 100", () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => paginationSchema.parse({ offset: -1 })).toThrow();
  });
});

describe("syncLogsQuerySchema", () => {
  it("accepts valid status values", () => {
    for (const status of ["running", "completed", "failed"]) {
      expect(syncLogsQuerySchema.parse({ status }).status).toBe(status);
    }
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

describe("jobStatusesQuerySchema", () => {
  it("parses comma-separated valid statuses", () => {
    const result = jobStatusesQuerySchema.parse({ statuses: "active,failed" });
    expect(result.statuses).toEqual(["active", "failed"]);
  });

  it("filters out invalid statuses", () => {
    const result = jobStatusesQuerySchema.parse({ statuses: "active,bogus,failed" });
    expect(result.statuses).toEqual(["active", "failed"]);
  });

  it("returns undefined when statuses not provided", () => {
    expect(jobStatusesQuerySchema.parse({}).statuses).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(jobStatusesQuerySchema.parse({ statuses: "" }).statuses).toBeUndefined();
  });

  it("accepts all valid statuses", () => {
    const result = jobStatusesQuerySchema.parse({
      statuses: "active,waiting,delayed,completed,failed",
    });
    expect(result.statuses).toEqual(["active", "waiting", "delayed", "completed", "failed"]);
  });
});

describe("updateScheduleBodySchema", () => {
  it("accepts valid cron expression", () => {
    const result = updateScheduleBodySchema.parse({ cronExpression: "0 4 * * *" });
    expect(result.cronExpression).toBe("0 4 * * *");
  });

  it("rejects invalid cron expression", () => {
    expect(() => updateScheduleBodySchema.parse({ cronExpression: "invalid" })).toThrow();
  });

  it("rejects cron with wrong number of fields", () => {
    expect(() => updateScheduleBodySchema.parse({ cronExpression: "* * *" })).toThrow();
    expect(() => updateScheduleBodySchema.parse({ cronExpression: "* * * * * *" })).toThrow();
  });

  it("accepts all fields together", () => {
    const input = {
      enabled: false,
      cronExpression: "*/5 * * * *",
      timezone: "UTC",
      updatedBy: "admin",
    };
    expect(updateScheduleBodySchema.parse(input)).toEqual(input);
  });

  it("allows empty object", () => {
    const result = updateScheduleBodySchema.parse({});
    expect(result.enabled).toBeUndefined();
    expect(result.cronExpression).toBeUndefined();
    expect(result.timezone).toBeUndefined();
    expect(result.updatedBy).toBeUndefined();
  });

  it("rejects empty timezone string", () => {
    expect(() => updateScheduleBodySchema.parse({ timezone: "" })).toThrow();
  });

  it("accepts complex cron expressions", () => {
    const expressions = ["0 0,12 * * 1-5", "*/15 * * * *", "0 4 1,15 * *"];
    for (const cronExpression of expressions) {
      expect(updateScheduleBodySchema.parse({ cronExpression }).cronExpression).toBe(cronExpression);
    }
  });
});
