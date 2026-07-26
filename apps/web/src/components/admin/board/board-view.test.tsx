// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

const useBoardMock = vi.fn();
const useBoardTasksMock = vi.fn();
vi.mock("@/hooks/use-board", () => ({
  useBoard: (...args: unknown[]) => useBoardMock(...args),
  useBoardTasks: (...args: unknown[]) => useBoardTasksMock(...args),
}));

vi.mock("@/hooks/use-board-filters", () => ({
  useBoardFilters: () => ({
    filters: { assigneeIds: [], priority: "", q: "" },
  }),
}));

// The board chrome is not under test; only the load-failure branch is.
vi.mock("./board-toolbar", () => ({ BoardToolbar: () => <div /> }));
vi.mock("./kanban-board", () => ({ KanbanBoard: () => <div data-testid="kanban" /> }));
vi.mock("./create-task-dialog", () => ({ CreateTaskDialog: () => null }));
vi.mock("./column-settings-dialog", () => ({ ColumnSettingsDialog: () => null }));
vi.mock("./task-dialog", () => ({ TaskDialog: () => null }));

import { BoardView } from "./board-view";

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() };

describe("<BoardView>", () => {
  beforeEach(() => {
    useBoardMock.mockReset();
    useBoardTasksMock.mockReset();
    useBoardTasksMock.mockReturnValue({ ...idle, data: [] });
  });
  afterEach(cleanup);

  it("does not claim 'no board found' when the board failed to load", () => {
    const mutate = vi.fn();
    useBoardMock.mockReturnValue({ ...idle, error: new Error("down"), mutate });

    render(<BoardView boardId={1} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("emptyBoard")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tryAgain/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("shows a loading affordance while the board is still loading", () => {
    useBoardMock.mockReturnValue({ ...idle, isLoading: true });

    render(<BoardView boardId={1} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("emptyBoard")).not.toBeInTheDocument();
  });

  it("still shows 'no board found' when the API confirms there is no board", () => {
    useBoardMock.mockReturnValue({ ...idle, data: null });

    render(<BoardView boardId={1} />);
    expect(screen.getByText("emptyBoard")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
