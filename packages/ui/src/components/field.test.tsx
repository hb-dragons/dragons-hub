// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { Field, FieldLabel, FieldDescription, FieldError } from "./field";

afterEach(cleanup);

// Field is a thin set of wrappers, but two behaviours here are hand-written and
// were changed deliberately (#115): FieldError renders nothing when empty, and
// it announces itself as an alert. Both are load-bearing for form a11y.
describe("FieldError", () => {
  it("renders nothing when it has no children", () => {
    const { container } = render(<FieldError />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty string, so `error && ...` is not needed", () => {
    const { container } = render(<FieldError>{""}</FieldError>);
    expect(container).toBeEmptyDOMElement();
  });

  it("announces its message as an alert", () => {
    render(<FieldError>Datum fehlt</FieldError>);
    expect(screen.getByRole("alert")).toHaveTextContent("Datum fehlt");
  });

  it("lets the caller override the role", () => {
    render(<FieldError role="status">Datum fehlt</FieldError>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Datum fehlt");
  });

  it("forwards id so a control can point aria-describedby at it", () => {
    render(<FieldError id="date-error">Datum fehlt</FieldError>);
    expect(screen.getByRole("alert")).toHaveAttribute("id", "date-error");
  });
});

describe("FieldLabel", () => {
  it("associates with a control via htmlFor", () => {
    render(
      <Field>
        <FieldLabel htmlFor="date">Datum</FieldLabel>
        <input id="date" />
        <FieldDescription>Format TT.MM.JJJJ</FieldDescription>
      </Field>,
    );
    expect(screen.getByLabelText("Datum")).toHaveAttribute("id", "date");
    expect(screen.getByText("Format TT.MM.JJJJ")).toHaveAttribute(
      "data-slot",
      "field-description",
    );
  });
});
