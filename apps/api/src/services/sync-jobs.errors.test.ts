import { describe, expect, it } from "vitest";
import { SyncAlreadyQueuedError, SyncJobNotFailedError } from "./sync-jobs.errors";

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

describe("SyncJobNotFailedError", () => {
  it("is an Error carrying the INVALID_STATE code and a 400 status", () => {
    const error = new SyncJobNotFailedError("completed");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SyncJobNotFailedError");
    expect(error.code).toBe("INVALID_STATE");
    expect(error.status).toBe(400);
  });

  it("names the state that blocked the retry", () => {
    expect(new SyncJobNotFailedError("active").message).toBe(
      "Job is not in failed state (current: active)",
    );
  });
});
