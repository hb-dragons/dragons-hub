// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SlotCard } from "./slot-card";

const assignReferee = vi.fn();
const unassignReferee = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    referees: {
      assignReferee: (...a: unknown[]) => assignReferee(...a),
      unassignReferee: (...a: unknown[]) => unassignReferee(...a),
    },
  },
}));

vi.mock("./candidate-picker", () => ({
  CandidatePicker: ({ onPick, disabled }: { onPick: (n: number) => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => onPick(7)} data-testid="pick">
      pick
    </button>
  ),
}));

const messages = { refereeHub: { openSlots: {
  slot: {
    label: "Referee {n}", open: "Open", offered: "Offered", unassign: "Remove",
    assignFailed: "Assigning failed", unassignFailed: "Removing failed",
  },
  errorChip: { dismiss: "Dismiss" },
} } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

const open = { refereeApiId: null, refereeName: null, status: "open" as const };
const assigned = { refereeApiId: 9, refereeName: "Lena Bauer", status: "assigned" as const };

beforeEach(() => {
  assignReferee.mockReset();
  unassignReferee.mockReset();
});
afterEach(cleanup);

describe("SlotCard", () => {
  it("lists the candidates inline for an open slot", () => {
    render(wrap(<SlotCard gameApiId={1} slotNumber={2} assignment={open} onChange={() => {}} />));
    expect(screen.getByText("Referee 2")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByTestId("pick")).toBeInTheDocument();
  });

  it("offers candidates for an offered slot too", () => {
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={{ ...open, status: "offered" }} onChange={() => {}} />));
    expect(screen.getByText("Offered")).toBeInTheDocument();
    expect(screen.getByTestId("pick")).toBeInTheDocument();
  });

  it("assigns the picked referee to its slot and reports the change", async () => {
    assignReferee.mockResolvedValue({});
    const onChange = vi.fn();
    render(wrap(<SlotCard gameApiId={11} slotNumber={2} assignment={open} onChange={onChange} />));

    fireEvent.click(screen.getByTestId("pick"));

    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(assignReferee).toHaveBeenCalledWith(11, { slotNumber: 2, refereeApiId: 7 });
  });

  it("disables the candidates while an assignment is in flight", async () => {
    let resolve!: () => void;
    assignReferee.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={open} onChange={() => {}} />));

    fireEvent.click(screen.getByTestId("pick"));
    expect(screen.getByTestId("pick")).toBeDisabled();

    resolve();
    await waitFor(() => expect(screen.getByTestId("pick")).toBeEnabled());
  });

  it("shows a failed assignment and lets it be dismissed", async () => {
    assignReferee.mockRejectedValue(new Error("Federation said no"));
    const onChange = vi.fn();
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={open} onChange={onChange} />));

    fireEvent.click(screen.getByTestId("pick"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Federation said no");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falls back to a translated message when the error carries none", async () => {
    assignReferee.mockRejectedValue("boom");
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={open} onChange={() => {}} />));

    fireEvent.click(screen.getByTestId("pick"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Assigning failed");
  });

  it("shows the assigned referee with a remove action instead of candidates", async () => {
    unassignReferee.mockResolvedValue({});
    const onChange = vi.fn();
    render(wrap(<SlotCard gameApiId={11} slotNumber={1} assignment={assigned} onChange={onChange} />));

    expect(screen.getByText("Lena Bauer")).toBeInTheDocument();
    expect(screen.queryByTestId("pick")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(unassignReferee).toHaveBeenCalledWith(11, 1);
  });

  it("shows a failed removal", async () => {
    unassignReferee.mockRejectedValue("boom");
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={assigned} onChange={() => {}} />));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Removing failed");
  });
});
