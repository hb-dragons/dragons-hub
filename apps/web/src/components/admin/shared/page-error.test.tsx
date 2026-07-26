// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PageError } from "./page-error";

describe("<PageError>", () => {
  afterEach(cleanup);

  it("announces the failure rather than rendering as ordinary copy", () => {
    // "we could not load it" and "there is nothing here" must stay
    // distinguishable to assistive tech and to regression tests.
    render(<PageError message="Failed to connect to API" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Failed to connect to API");
  });
});
