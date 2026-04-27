import { describe, it, expect } from "vitest";
import {
  buildUndoEntry,
  type UndoEntry,
  type UndoableTaskSnapshot,
  type UndoableChecklistSnapshot,
  type UndoableCommentSnapshot,
} from "./board-undo";

describe("buildUndoEntry", () => {
  it("captures task delete snapshot", () => {
    const snap: UndoableTaskSnapshot = {
      kind: "task",
      taskId: 5,
      columnId: 2,
      position: 3,
      title: "Foo",
    };
    const entry: UndoEntry = buildUndoEntry(snap);
    expect(entry.kind).toBe("task");
    expect(entry.snapshot).toEqual(snap);
    expect(typeof entry.expiresAtMs).toBe("number");
    expect(entry.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it("captures checklist item snapshot", () => {
    const snap: UndoableChecklistSnapshot = {
      kind: "checklist",
      taskId: 1,
      itemId: 9,
      label: "Step",
      isChecked: false,
      position: 0,
    };
    const entry = buildUndoEntry(snap);
    expect(entry.kind).toBe("checklist");
    expect(entry.snapshot).toEqual(snap);
  });

  it("captures comment snapshot", () => {
    const snap: UndoableCommentSnapshot = {
      kind: "comment",
      taskId: 4,
      commentId: 22,
      body: "hi",
      createdAt: "2026-04-27T09:00:00Z",
      authorId: "u1",
    };
    const entry = buildUndoEntry(snap);
    expect(entry.kind).toBe("comment");
    expect(entry.snapshot).toEqual(snap);
  });

  it("respects custom ttl", () => {
    const before = Date.now();
    const entry = buildUndoEntry(
      {
        kind: "task",
        taskId: 1,
        columnId: 1,
        position: 0,
        title: "x",
      },
      { ttlMs: 1000 },
    );
    expect(entry.expiresAtMs - before).toBeGreaterThanOrEqual(1000);
    expect(entry.expiresAtMs - before).toBeLessThanOrEqual(1100);
  });
});
