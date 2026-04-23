// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { TaskCard } from "./task-card";
import type { TaskCardData } from "@dragons/shared";

const messages = {
  board: {
    priority: { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" },
  },
};

function base(overrides: Partial<TaskCardData> = {}): TaskCardData {
  return {
    id: 1,
    boardId: 1,
    title: "Book gym",
    description: null,
    priority: "normal",
    dueDate: null,
    position: 0,
    columnId: 1,
    checklistTotal: 0,
    checklistChecked: 0,
    assignees: [],
    ...overrides,
  };
}

function renderCard(task: TaskCardData) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TaskCard task={task} onOpen={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("TaskCard", () => {
  it("renders title and priority", () => {
    renderCard(base({ priority: "urgent" }));
    expect(screen.getByText("Book gym")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });

  it("renders due date when present", () => {
    renderCard(base({ dueDate: "2026-05-12" }));
    expect(screen.getByText(/2026-05-12/)).toBeInTheDocument();
  });

  it("renders checklist count when checklist exists", () => {
    renderCard(base({ checklistTotal: 5, checklistChecked: 2 }));
    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  it("renders assignees via stack when present", () => {
    renderCard(
      base({
        assignees: [
          { userId: "u1", name: "Alice", assignedAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    );
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
