// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

const formats = {
  dateTime: {
    short: { day: "2-digit", month: "2-digit", year: "numeric" },
  },
} as const;

function renderCard(task: TaskCardData) {
  return render(
    <NextIntlClientProvider
      locale="de"
      timeZone="Europe/Berlin"
      messages={messages}
      formats={formats}
    >
      <TaskCard task={task} onOpen={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

/**
 * Due dates arrive as a bare Berlin calendar day. They have to survive being
 * anchored in a UTC SSR container and in an admin's own zone, so none of these
 * run under Europe/Berlin — the zone that hides the bug.
 */
const ZONES = ["UTC", "America/New_York", "Pacific/Kiritimati", "Pacific/Honolulu"];

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("TaskCard", () => {
  it("renders title and priority", () => {
    renderCard(base({ priority: "urgent" }));
    expect(screen.getByText("Book gym")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });

  it("renders the due date through the formatter, not as a raw API string", () => {
    renderCard(base({ dueDate: "2026-05-12" }));
    expect(screen.getByText(/12\.05\.2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-05-12/)).not.toBeInTheDocument();
  });

  it.each(ZONES)("names the task's own Berlin due day (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    // Summer (CEST) and winter (CET), i.e. either side of a DST switch, and in
    // both cases a day whose Berlin midnight falls on a different UTC day.
    renderCard(base({ dueDate: "2026-07-26" }));
    expect(screen.getByText(/26\.07\.2026/)).toBeInTheDocument();
    cleanup();
    renderCard(base({ dueDate: "2026-01-01" }));
    expect(screen.getByText(/01\.01\.2026/)).toBeInTheDocument();
  });

  it("renders no due date when the task has none", () => {
    renderCard(base({ dueDate: null }));
    expect(screen.queryByText(/\d{2}\.\d{2}\.\d{4}/)).not.toBeInTheDocument();
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
