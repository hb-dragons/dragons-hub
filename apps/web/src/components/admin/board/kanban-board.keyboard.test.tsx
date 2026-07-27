// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BoardData, TaskCardData } from "@dragons/shared";

const moveTask = vi.fn(() => Promise.resolve());
const reorderColumns = vi.fn(() => Promise.resolve());

vi.mock("@/hooks/use-task-mutations", () => ({
  useTaskMutations: () => ({ moveTask }),
}));
vi.mock("@/hooks/use-column-mutations", () => ({
  useColumnMutations: () => ({ reorderColumns }),
}));

import { KanbanBoard } from "./kanban-board";

const messages = {
  board: {
    priority: { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" },
    addTask: "Add task",
    emptyColumn: "No tasks",
    column: { wipOver: "Over WIP" },
    actions: { editBoard: "Edit Board" },
    dnd: {
      handle: "Drag {title}",
      pickUp:
        "Picked up {title}. Now in {column}, position {position} of {total}.",
      move: "Now in {column}, position {position} of {total}.",
      drop: "Dropped in {column} at position {position}.",
      cancel: "Drag cancelled.",
    },
  },
};

const board: BoardData = {
  id: 1,
  name: "Ops",
  description: null,
  columns: [
    { id: 1, boardId: 1, name: "To Do", position: 0, color: null },
    { id: 2, boardId: 1, name: "Doing", position: 1, color: null },
  ],
} as unknown as BoardData;

const task: TaskCardData = {
  id: 10,
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
};

const CARD_RECT = "8,108,264,80";

function toRect(raw: string): DOMRect {
  const [x, y, width, height] = raw.split(",").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * happy-dom returns an all-zero rect for every element, and dnd-kit's keyboard
 * coordinate getter needs real geometry to decide which droppable lies to the
 * right. Serve rects from a `data-rect` attribute the test stamps on the nodes
 * it cares about. The DragOverlay mounts mid-drag (so it cannot be stamped up
 * front) and dnd-kit measures it as the collision rect — give any unstamped
 * subtree that renders the dragged card, i.e. the overlay, the card's own rect.
 */
function stubGeometry() {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute("data-rect");
    if (raw) return toRect(raw);
    const isOverlay =
      !this.querySelector("[data-rect]") &&
      (this.textContent ?? "").includes(task.title);
    return isOverlay ? toRect(CARD_RECT) : original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

function layout() {
  // Column bodies (the droppable nodes) side by side, the card inside the left.
  const bodies = document.querySelectorAll<HTMLElement>(".min-h-\\[50px\\]");
  bodies[0]?.setAttribute("data-rect", "0,100,280,400");
  bodies[1]?.setAttribute("data-rect", "300,100,280,400");
  const outers = document.querySelectorAll<HTMLElement>(".w-72");
  outers[0]?.setAttribute("data-rect", "0,0,280,500");
  outers[1]?.setAttribute("data-rect", "300,0,280,500");
  const cardWrapper = bodies[0]?.firstElementChild as HTMLElement | undefined;
  cardWrapper?.setAttribute("data-rect", CARD_RECT);
}

function renderBoard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <KanbanBoard
        board={board}
        tasks={[task]}
        onOpenTask={vi.fn()}
        onAddTask={vi.fn()}
        onEditColumn={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("KanbanBoard keyboard drag and drop", () => {
  let restore: () => void;

  beforeEach(() => {
    moveTask.mockClear();
    reorderColumns.mockClear();
    restore = stubGeometry();
  });

  afterEach(() => {
    restore();
    cleanup();
  });

  it("exposes a focusable drag handle on each task card", () => {
    renderBoard();
    const handle = screen.getByRole("button", { name: "Drag Book gym" });
    expect(handle).toBeInTheDocument();
    // dnd-kit's sortable attributes must survive onto the handle — they are
    // what makes the KeyboardSensor reachable at all.
    expect(handle).toHaveAttribute("aria-roledescription");
    expect(handle).toHaveAttribute("aria-describedby");
  });

  it("picks a task up, moves it to the next column and drops it, announcing each step", async () => {
    renderBoard();
    const handle = screen.getByRole("button", { name: "Drag Book gym" });
    layout();

    const liveRegion = await screen.findByRole("status");
    const announced: string[] = [];
    const record = (text: string | null | undefined) => {
      const trimmed = (text ?? "").trim();
      if (trimmed && announced[announced.length - 1] !== trimmed) {
        announced.push(trimmed);
      }
    };
    // The live region only ever holds the newest message and several land in a
    // single flush, so the sequence is reconstructed from each mutation's
    // oldValue.
    const observer = new MutationObserver((records) => {
      for (const r of records) record(r.oldValue);
      record(liveRegion.textContent);
    });
    observer.observe(liveRegion, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });

    // happy-dom drops mutation records often enough to matter — roughly 1 run
    // in 13 it delivered the pickup records and then silently missed the
    // ArrowRight one. Waiting on `announced` alone is unrecoverable when that
    // happens: the DOM already holds the right text, but the array has stopped
    // growing, so the condition can never come true and no timeout rescues it.
    // That stalled the full 20s in a stress run and is what made this file fail
    // under `pnpm coverage` in CI. Sampling the region on every poll makes the
    // wait depend on the DOM rather than on record delivery; the observer stays
    // only to catch messages replaced between two polls.
    const waitForAnnouncement = (needle: string) =>
      waitFor(() => {
        record(liveRegion.textContent);
        expect(announced.some((a) => a.includes(needle))).toBe(true);
      });

    handle.focus();
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await waitForAnnouncement("Picked up Book gym");

    fireEvent.keyDown(handle, { key: "ArrowRight", code: "ArrowRight" });
    await waitForAnnouncement("Now in Doing");

    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await waitForAnnouncement("Dropped in Doing");
    observer.disconnect();

    expect(announced.some((a) => a.includes("Picked up Book gym"))).toBe(true);
    expect(moveTask).toHaveBeenCalledTimes(1);
    expect(moveTask.mock.calls[0]![0]).toBe(10);
    expect(moveTask.mock.calls[0]![1]).toBe(2);
  });

  it("does not open the task dialog when the handle is activated", () => {
    const onOpenTask = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <KanbanBoard
          board={board}
          tasks={[task]}
          onOpenTask={onOpenTask}
          onAddTask={vi.fn()}
          onEditColumn={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    const handle = screen.getByRole("button", { name: "Drag Book gym" });
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    expect(onOpenTask).not.toHaveBeenCalled();
  });
});
