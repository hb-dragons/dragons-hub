import { describe, it, expect } from "vitest";
import { renderTaskMessage } from "./task";

describe("renderTaskMessage", () => {
  const assignedPayload = {
    taskId: 1,
    boardId: 10,
    boardName: "Board X",
    title: "Write report",
    assigneeUserIds: ["u1"],
    assignedBy: "Alice",
    dueDate: null,
    priority: "normal" as const,
  };

  it("renders task.assigned in German", () => {
    const result = renderTaskMessage("task.assigned", assignedPayload, "Write report", "de");
    expect(result).toEqual({
      title: "Neue Aufgabe: Write report",
      body: "Alice hat dich einer Aufgabe auf Board X zugewiesen.",
    });
  });

  it("renders task.assigned in English", () => {
    const result = renderTaskMessage("task.assigned", assignedPayload, "Write report", "en");
    expect(result).toEqual({
      title: "New task: Write report",
      body: "Alice assigned you a task on Board X.",
    });
  });

  it("renders task.unassigned in German", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      unassignedUserIds: ["u1"],
      unassignedBy: "Alice",
    };
    const result = renderTaskMessage("task.unassigned", payload, "Write report", "de");
    expect(result).toEqual({
      title: "Aufgabe entfernt: Write report",
      body: "Alice hat dich von einer Aufgabe auf Board X entfernt.",
    });
  });

  it("renders task.unassigned in English", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      unassignedUserIds: ["u1"],
      unassignedBy: "Alice",
    };
    const result = renderTaskMessage("task.unassigned", payload, "Write report", "en");
    expect(result).toEqual({
      title: "Removed from task: Write report",
      body: "Alice removed you from a task on Board X.",
    });
  });

  it("renders task.comment.added with preview (English)", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      commentId: 7,
      authorId: "u2",
      authorName: "Bob",
      bodyPreview: "Looks good to me.",
      recipientUserIds: ["u1"],
    };
    const result = renderTaskMessage("task.comment.added", payload, "Write report", "en");
    expect(result).toEqual({
      title: "New comment: Write report",
      body: "Bob: Looks good to me.",
    });
  });

  it("renders task.comment.added with preview (German)", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Bericht schreiben",
      commentId: 7,
      authorId: "u2",
      authorName: "Bob",
      bodyPreview: "Sieht gut aus.",
      recipientUserIds: ["u1"],
    };
    const result = renderTaskMessage("task.comment.added", payload, "Bericht schreiben", "de");
    expect(result).toEqual({
      title: "Neuer Kommentar: Bericht schreiben",
      body: "Bob: Sieht gut aus.",
    });
  });

  it("renders task.due.reminder lead variant", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      dueDate: "2026-05-01",
      reminderKind: "lead" as const,
      assigneeUserIds: ["u1"],
    };
    const result = renderTaskMessage("task.due.reminder", payload, "Write report", "de");
    expect(result).toEqual({
      title: "Morgen fällig: Write report",
      body: "Deine Aufgabe auf Board X ist morgen fällig.",
    });
  });

  it("renders task.due.reminder day_of variant in English", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      dueDate: "2026-05-01",
      reminderKind: "day_of" as const,
      assigneeUserIds: ["u1"],
    };
    const result = renderTaskMessage("task.due.reminder", payload, "Write report", "en");
    expect(result).toEqual({
      title: "Due today: Write report",
      body: "Your task on Board X is due today.",
    });
  });

  it("returns null for non-task event type", () => {
    expect(renderTaskMessage("match.cancelled", {}, "x", "de")).toBeNull();
  });
});
