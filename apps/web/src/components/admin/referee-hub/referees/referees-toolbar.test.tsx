// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { DEFAULT_REFEREE_LIST, type RefereeListView } from "./referee-list-query";
import { RefereesToolbar } from "./referees-toolbar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function toolbar(props: Partial<Parameters<typeof RefereesToolbar>[0]> = {}, view: RefereeListView = DEFAULT_REFEREE_LIST) {
  const onChange = props.onChange ?? vi.fn();
  return {
    onChange,
    ui: (
      <NextIntlClientProvider locale="en" messages={en}>
        <RefereesToolbar view={view} onChange={onChange} counts={{ own: 7, all: 23 }} total={7} average={6} {...props} />
      </NextIntlClientProvider>
    ),
  };
}

describe("RefereesToolbar", () => {
  it("offers both scopes with their counts and reports a switch", () => {
    const { ui, onChange } = toolbar();
    render(ui);
    expect(screen.getByRole("radio", { name: "Own (7)" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "All (23)" }));
    expect(onChange).toHaveBeenCalledWith({ scope: "all" });
  });

  it("leaves the counts out of the scope labels until they are known", () => {
    render(toolbar({ counts: null }).ui);
    expect(screen.getByRole("radiogroup", { name: "Scope" })).toHaveTextContent(/^OwnAll$/);
  });

  it("reports a picked sort", () => {
    const { ui, onChange } = toolbar();
    render(ui);
    fireEvent.click(screen.getByRole("radio", { name: "Most games" }));
    expect(onChange).toHaveBeenCalledWith({ sort: "workloadDesc" });
  });

  it("summarises the matching referees, with the average only when it is given", () => {
    const { rerender } = render(toolbar().ui);
    expect(screen.getByText("7 referees · avg 6 games")).toBeInTheDocument();
    rerender(toolbar({ total: 1, average: null }).ui);
    expect(screen.getByText("1 referee")).toBeInTheDocument();
    rerender(toolbar({ total: null }).ui);
    expect(screen.queryByText(/referee/)).not.toBeInTheDocument();
  });

  it("reports typed search text once, after the debounce, and follows the URL back", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(toolbar({ onChange }).ui);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "mül" } });
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ search: "mül" });

    rerender(toolbar({ onChange }, { ...DEFAULT_REFEREE_LIST, search: "mül" }).ui);
    expect(input).toHaveValue("mül");
    rerender(toolbar({ onChange }, DEFAULT_REFEREE_LIST).ui);
    expect(input).toHaveValue("");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
