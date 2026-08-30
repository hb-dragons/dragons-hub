// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { Table } from "./table";

describe("<Table>", () => {
  afterEach(cleanup);

  it("forwards containerClassName to the scroll container around the table", () => {
    render(<Table containerClassName="max-h-64 overflow-auto" />);

    const container = document.querySelector('[data-slot="table-container"]');
    // tailwind-merge collapses the default overflow-x-auto into the caller's
    // overflow-auto — both axes stay scrollable.
    expect(container).toHaveClass("max-h-64", "overflow-auto");
    expect(container).not.toHaveClass("overflow-x-auto");
  });

  it("keeps the plain container when no containerClassName is given", () => {
    render(<Table />);

    const container = document.querySelector('[data-slot="table-container"]');
    expect(container).toHaveClass("overflow-x-auto");
  });
});
