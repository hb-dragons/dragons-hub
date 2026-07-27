import { describe, expect, it } from "vitest";
import { SyncAlreadyQueuedError } from "./sync-jobs.errors";

describe("SyncAlreadyQueuedError", () => {
  it("is an Error carrying the SYNC_ALREADY_QUEUED code", () => {
    const error = new SyncAlreadyQueuedError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SyncAlreadyQueuedError");
    expect(error.code).toBe("SYNC_ALREADY_QUEUED");
    expect(error.message).toBe("Sync already in progress or queued");
  });

  it("accepts a caller-supplied message", () => {
    expect(new SyncAlreadyQueuedError("referee sync busy").message).toBe("referee sync busy");
  });
});
