// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SlotCard } from "./slot-card";

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast }));

const fetchAPI = vi.fn();
vi.mock("@/lib/api", () => ({ fetchAPI: (...a: unknown[]) => fetchAPI(...a), APIError: class extends Error {} }));

vi.mock("./candidate-picker", () => ({
  CandidatePicker: ({ onPick }: { onPick: (n: number) => void }) =>
    <button onClick={() => onPick(7)} data-testid="pick">pick</button>,
}));

const messages = { refereeHub: { openSlots: {
  slot: { label: "SR{n}", open: "Open", unassign: "Unassign" },
  errorChip: { dismiss: "Dismiss" },
} } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => { fetchAPI.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });
afterEach(() => cleanup());

describe("SlotCard", () => {
  it("renders inline error chip on assign failure (no toast)", async () => {
    fetchAPI.mockRejectedValueOnce(new Error("federation down"));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={{ refereeApiId: null, refereeName: null, status: "open" }} onChange={() => {}} />));
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(screen.getByText(/federation down/)).toBeInTheDocument());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("dismiss clears the chip", async () => {
    fetchAPI.mockRejectedValueOnce(new Error("nope"));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={{ refereeApiId: null, refereeName: null, status: "open" }} onChange={() => {}} />));
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(screen.getByText("nope")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
  });

  it("does not toast on success either", async () => {
    fetchAPI.mockResolvedValueOnce({});
    const onChange = vi.fn();
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={{ refereeApiId: null, refereeName: null, status: "open" }} onChange={onChange} />));
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
