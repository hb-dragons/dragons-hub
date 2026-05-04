import { describe, expect, it, beforeEach } from "vitest";
import { tryAcquire, release, __snapshotForTests } from "./connection-cap";

beforeEach(() => {
  while (__snapshotForTests().total > 0) {
    release("d1");
    release("d2");
  }
});

describe("connection-cap", () => {
  it("acquires and releases a slot", () => {
    expect(tryAcquire("d1")).toBe(true);
    expect(__snapshotForTests().total).toBe(1);
    release("d1");
    expect(__snapshotForTests().total).toBe(0);
  });

  it("rejects beyond per-device cap", () => {
    for (let i = 0; i < 50; i++) expect(tryAcquire("d1")).toBe(true);
    expect(tryAcquire("d1")).toBe(false);
    for (let i = 0; i < 50; i++) release("d1");
  });

  it("allows other devices when one device is at cap", () => {
    for (let i = 0; i < 50; i++) tryAcquire("d1");
    expect(tryAcquire("d2")).toBe(true);
    release("d2");
    for (let i = 0; i < 50; i++) release("d1");
  });

  it("release on unknown device is a no-op", () => {
    release("never-acquired");
    expect(__snapshotForTests().total).toBe(0);
  });
});
