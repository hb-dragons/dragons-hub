// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mocks = vi.hoisted(() => ({
  addColumn: vi.fn(),
  updateColumn: vi.fn(),
  deleteColumn: vi.fn(),
  reorderColumns: vi.fn(),
  mutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("swr", () => ({
  default: () => ({ data: undefined }),
  useSWRConfig: () => ({ mutate: mocks.mutate }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    boards: {
      addColumn: mocks.addColumn,
      updateColumn: mocks.updateColumn,
      deleteColumn: mocks.deleteColumn,
      reorderColumns: mocks.reorderColumns,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { ColumnSettingsDialog } from "./column-settings-dialog";
import type { BoardColumnData } from "./types";

const messages = {
  common: { cancel: "Cancel", save: "Save", saving: "Saving..." },
  board: {
    addColumn: "Add Column",
    editColumn: "Edit Column",
    deleteColumn: "Delete Column",
    task: { title: "Title" },
    column: { colorHex: "Color (hex)", doneColumn: "Done column" },
    delete: {
      columnTitle: "Delete column?",
      columnBody: "The column must be empty before it can be deleted.",
      confirm: "Delete",
      cancel: "Cancel",
    },
  },
};

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const column: BoardColumnData = {
  id: 9,
  name: "Doing",
  position: 1,
  color: null,
  isDoneColumn: false,
};

function renderDialog(col: BoardColumnData | null = column) {
  return render(
    wrap(
      <ColumnSettingsDialog
        open
        onOpenChange={() => {}}
        boardId={1}
        column={col}
      />,
    ),
  );
}

function clickDelete() {
  fireEvent.click(
    screen.getByRole("button", { name: /Delete Column/, hidden: true }),
  );
}

async function confirmDelete() {
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Delete", hidden: true }),
    );
  });
}

describe("ColumnSettingsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteColumn.mockResolvedValue(undefined);
    mocks.updateColumn.mockResolvedValue(undefined);
    mocks.addColumn.mockResolvedValue({ id: 10 });
  });
  afterEach(cleanup);

  it("asks for confirmation before deleting a column", () => {
    renderDialog();
    clickDelete();

    expect(mocks.deleteColumn).not.toHaveBeenCalled();
    expect(screen.getByText("Delete column?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The column must be empty before it can be deleted.",
      ),
    ).toBeInTheDocument();
  });

  it("deletes only after the confirmation is accepted", async () => {
    renderDialog();
    clickDelete();
    await confirmDelete();

    expect(mocks.deleteColumn).toHaveBeenCalledWith(1, 9);
  });

  it("invalidates filtered board task keys on delete", async () => {
    renderDialog();
    clickDelete();
    await confirmDelete();

    const matchers = mocks.mutate.mock.calls
      .map((call) => call[0])
      .filter((arg): arg is (key: unknown) => boolean => typeof arg === "function");

    expect(matchers.length).toBeGreaterThan(0);
    expect(
      matchers.some((m) => m("/admin/boards/1/tasks?priority=high")),
    ).toBe(true);
    expect(matchers.some((m) => m("/admin/boards/1/tasks"))).toBe(true);
    expect(matchers.some((m) => m("/admin/boards/2/tasks"))).toBe(false);
  });

  it("surfaces a delete failure to the user", async () => {
    mocks.deleteColumn.mockRejectedValue(
      new Error("Column not found or has tasks"),
    );
    renderDialog();
    clickDelete();
    await confirmDelete();

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Column not found or has tasks",
    );
  });

  it("surfaces a save failure to the user", async () => {
    mocks.updateColumn.mockRejectedValue(new Error("Column name taken"));
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(mocks.toastError).toHaveBeenCalledWith("Column name taken");
  });

  it("creates a column through the shared mutation hook", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Backlog" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(mocks.addColumn).toHaveBeenCalledWith(1, {
      name: "Backlog",
      color: null,
      isDoneColumn: false,
    });
  });
});
