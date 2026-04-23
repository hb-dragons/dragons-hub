// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { IssuesCallout } from "./issues-callout";
import en from "@/messages/en.json";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

describe("IssuesCallout", () => {
  it("renders nothing when both counts are zero", () => {
    const { container } = render(wrap(
      <IssuesCallout cancelled={0} forfeited={0} onNavigate={() => {}} />,
    ));
    expect(container).toBeEmptyDOMElement();
  });

  it("fires onNavigate when clicked", () => {
    const onNavigate = vi.fn();
    render(wrap(<IssuesCallout cancelled={3} forfeited={2} onNavigate={onNavigate} />));
    fireEvent.click(screen.getByTestId("issues-callout"));
    expect(onNavigate).toHaveBeenCalled();
  });
});
