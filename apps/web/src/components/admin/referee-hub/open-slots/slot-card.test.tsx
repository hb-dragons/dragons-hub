// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SlotCard } from "./slot-card";

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast }));

const assignReferee = vi.fn();
const unassignReferee = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    referees: {
      assignReferee: (...a: unknown[]) => assignReferee(...a),
      unassignReferee: (...a: unknown[]) => unassignReferee(...a),
    },
  },
  APIError: class extends Error {},
}));

vi.mock("./candidate-picker", () => ({
  CandidatePicker: ({ onPick }: { onPick: (n: number) => void }) =>
    <button onClick={() => onPick(7)} data-testid="pick">pick</button>,
}));

const messages = { refereeHub: { openSlots: {
  slot: { label: "SR{n}", open: "Open", unassign: "Unassign" },
  errorChip: { dismiss: "Dismiss" },
  picker: { assignTrigger: "Assign referee…" },
} } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

const openAssignment = { refereeApiId: null, refereeName: null, status: "open" as const };

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: /assign referee/i }));
}

beforeEach(() => { assignReferee.mockReset(); unassignReferee.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });
afterEach(() => cleanup());

describe("SlotCard", () => {
  it("renders a compact trigger instead of an inline candidate list", () => {
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    expect(screen.getByRole("button", { name: /assign referee/i })).toBeInTheDocument();
    expect(screen.queryByTestId("pick")).not.toBeInTheDocument();
  });

  it("opens the picker popover from the trigger", () => {
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    openPicker();
    expect(screen.getByTestId("pick")).toBeInTheDocument();
  });

  it("closes the popover and calls onChange after a successful assign", async () => {
    assignReferee.mockResolvedValueOnce({});
    const onChange = vi.fn();
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={onChange} />));
    openPicker();
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("pick")).not.toBeInTheDocument());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps the popover open and shows the inline error chip on assign failure (no toast)", async () => {
    assignReferee.mockRejectedValueOnce(new Error("federation down"));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    openPicker();
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(screen.getAllByText(/federation down/).length).toBeGreaterThan(0));
    expect(screen.getByTestId("pick")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("dismiss clears the chip", async () => {
    assignReferee.mockRejectedValueOnce(new Error("nope"));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    openPicker();
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(screen.getAllByText("nope").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
  });

  it("disables the trigger while an assign is in flight", async () => {
    let resolveAssign: (v: unknown) => void = () => {};
    assignReferee.mockReturnValueOnce(new Promise((res) => { resolveAssign = res; }));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    openPicker();
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /assign referee/i })).toBeDisabled(),
    );
    resolveAssign({});
    await waitFor(() => expect(screen.queryByTestId("pick")).not.toBeInTheDocument());
  });

  it("shows the assign error inside the open popover", async () => {
    assignReferee.mockRejectedValueOnce(new Error("federation down"));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    openPicker();
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(screen.getByTestId("popover-error")).toHaveTextContent("federation down"));
  });

  it("renders the unassign button (not the trigger) for an assigned slot", () => {
    render(wrap(
      <SlotCard
        gameApiId={1}
        slotNumber={1}
        assignment={{ refereeApiId: 9, refereeName: "Kim Becker", status: "assigned" }}
        onChange={() => {}}
      />,
    ));
    expect(screen.getByRole("button", { name: /unassign/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assign referee/i })).not.toBeInTheDocument();
    expect(screen.getByText("Kim Becker")).toBeInTheDocument();
  });
});
