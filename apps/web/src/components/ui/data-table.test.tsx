// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

import { DataTable } from "./data-table";

interface Item {
  id: string;
  name: string;
}

const columns: ColumnDef<Item, unknown>[] = [
  { accessorKey: "name", header: "Name" },
];

const data: Item[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Bravo" },
];

describe("<DataTable> row interaction", () => {
  afterEach(cleanup);

  it("rows without a click handler are plain rows, not fake buttons", () => {
    render(<DataTable columns={columns} data={data} />);
    // No onRowClick was passed: rows must NOT claim to be interactive.
    expect(screen.queryByRole("button", { name: /alpha/i })).not.toBeInTheDocument();
  });

  it("exposes each clickable row as a keyboard-focusable, named control", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);

    const row = screen.getByRole("button", { name: /alpha/i });
    expect(row).toHaveAttribute("tabindex", "0");
  });

  it("activates a row's onRowClick handler via the Enter key, not just a mouse click", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);

    const row = screen.getByRole("button", { name: /alpha/i });
    row.focus();
    expect(row).toHaveFocus();

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("activates a row's onRowClick handler via the Space key", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);

    const row = screen.getByRole("button", { name: /bravo/i });
    fireEvent.keyDown(row, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("does not activate on unrelated keys", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);

    const row = screen.getByRole("button", { name: /alpha/i });
    fireEvent.keyDown(row, { key: "Tab" });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("still fires onRowClick on a mouse click", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);

    fireEvent.click(screen.getByRole("button", { name: /alpha/i }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});

describe("<DataTable> mobile scroll layout", () => {
  afterEach(cleanup);

  it("makes the header row sticky when stickyHeader is set", () => {
    render(<DataTable columns={columns} data={data} stickyHeader />);
    const thead = document.querySelector('[data-slot="table-header"]');
    expect(thead).toHaveClass("sticky", "top-0");
  });

  it("leaves the header static by default", () => {
    render(<DataTable columns={columns} data={data} />);
    const thead = document.querySelector('[data-slot="table-header"]');
    expect(thead).not.toHaveClass("sticky");
  });

  it("forwards containerClassName to the table scroll container", () => {
    render(
      <DataTable columns={columns} data={data} containerClassName="min-h-0 flex-1" />,
    );
    const container = document.querySelector('[data-slot="table-container"]');
    expect(container).toHaveClass("min-h-0", "flex-1");
  });

  it("applies className to the data table root", () => {
    render(<DataTable columns={columns} data={data} className="flex flex-col" />);
    const root = document.querySelector('[data-slot="data-table"]');
    expect(root).toHaveClass("flex", "flex-col", "space-y-2");
  });
});
