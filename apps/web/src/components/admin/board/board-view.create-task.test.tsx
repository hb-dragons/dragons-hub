// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BoardData } from "@dragons/shared";

const createTask = vi.fn(() => Promise.resolve({ id: 99 }));

vi.mock("@/hooks/use-task-mutations", () => ({
  useTaskMutations: () => ({ createTask, moveTask: vi.fn() }),
}));
vi.mock("@/hooks/use-column-mutations", () => ({
  useColumnMutations: () => ({ reorderColumns: vi.fn() }),
}));
vi.mock("@/hooks/use-users", () => ({ useUsers: () => ({ data: new Map() }) }));
vi.mock("@/hooks/use-board-filters", () => ({
  useBoardFilters: () => ({
    filters: { assigneeIds: [], priority: null, q: "" },
    update: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const board: BoardData = {
  id: 1,
  name: "Ops",
  description: null,
  columns: [
    { id: 11, boardId: 1, name: "To Do", position: 0, color: null },
    { id: 22, boardId: 1, name: "Doing", position: 1, color: null },
  ],
} as unknown as BoardData;

vi.mock("@/hooks/use-board", () => ({
  useBoard: () => ({ data: board }),
  useBoardTasks: () => ({ data: [] }),
}));

// Trimmed to the pieces BoardView renders — the toolbar and task dialog pull in
// SWR-backed trees that are not what this test is about.
vi.mock("./board-toolbar", () => ({
  BoardToolbar: () => <div data-testid="toolbar" />,
}));
vi.mock("./column-settings-dialog", () => ({
  ColumnSettingsDialog: () => null,
}));
vi.mock("./task-dialog", () => ({ TaskDialog: () => null }));

import { BoardView } from "./board-view";

const messages = {
  common: { columns: "Column", cancel: "Cancel", saving: "Saving…" },
  board: {
    addTask: "Add task",
    emptyBoard: "No board",
    emptyColumn: "No tasks",
    column: { wipOver: "Over WIP" },
    actions: { editBoard: "Edit Board" },
    dnd: { handle: "Drag {title}", pickUp: "", move: "", drop: "", cancel: "" },
    priority: { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" },
    task: {
      title: "Title",
      description: "Description",
      priority: "Priority",
      dueDate: "Due date",
      assignee: "Assignee",
    },
    filters: { search: "Search", noResults: "No results" },
    toast: { created: "Created" },
  },
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoardView boardId={1} />
    </NextIntlClientProvider>,
  );
}

/** The "+" button lives in each column header, in column order. */
function addButtons() {
  return screen.getAllByRole("button", { name: "Add task" });
}

describe("BoardView create-task dialog", () => {
  beforeEach(() => createTask.mockClear());
  afterEach(cleanup);

  it("creates the task in the column whose + was pressed", async () => {
    renderView();

    fireEvent.click(addButtons()[1]!);

    await screen.findByLabelText("Title");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Book gym" },
    });
    fireEvent.click(
      document.querySelector("form button[type=submit]") as HTMLButtonElement,
    );

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask.mock.calls[0]![0]).toMatchObject({
      title: "Book gym",
      columnId: 22,
    });
  });

  it("re-reads the default column each time it is opened", async () => {
    renderView();

    // Open on the first column, close without saving…
    fireEvent.click(addButtons()[0]!);
    await screen.findByLabelText("Title");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Title")).not.toBeInTheDocument(),
    );

    // …then reopen on the second: the dialog must not remember the old column.
    fireEvent.click(addButtons()[1]!);
    await screen.findByLabelText("Title");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Second" },
    });
    fireEvent.click(
      document.querySelector("form button[type=submit]") as HTMLButtonElement,
    );

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask.mock.calls[0]![0]).toMatchObject({ columnId: 22 });
  });
});
