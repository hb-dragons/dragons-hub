// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { TeamStaffMember } from "@dragons/shared";

const ada: TeamStaffMember = {
  id: 3,
  teamEntryId: 1,
  firstName: "Ada",
  lastName: "Lovelace",
  role: "trainer",
  phone: "+49 170 1234567",
  email: "ada@example.de",
  licence: "C-Lizenz",
  photoFilename: null,
  refereeContact: false,
};

const swrState = vi.hoisted(() => ({
  staff: [] as TeamStaffMember[],
  mutate: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (key: string | null) =>
    key === null
      ? { data: undefined, mutate: swrState.mutate }
      : { data: swrState.staff, mutate: swrState.mutate },
}));

vi.mock("@/lib/api", () => ({
  api: {
    teamStaff: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  },
}));

import { TeamStaffDialog } from "./team-staff-dialog";
import { api } from "@/lib/api";
import en from "@/messages/en.json";

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  swrState.staff = [];
  swrState.mutate.mockResolvedValue(undefined);
});

function renderDialog(canManage = true) {
  return render(
    <NextIntlClientProvider locale="en" timeZone="Europe/Berlin" messages={en}>
      <TeamStaffDialog entryId={1} teamName="Dragons U16" canManage={canManage} />
    </NextIntlClientProvider>,
  );
}

/** The dialog fetches nothing until it is open, so every test starts by opening it. */
function open() {
  renderDialog();
  fireEvent.click(screen.getByRole("button", { name: "Staff" }));
}

describe("TeamStaffDialog add", () => {
  it("posts the new staff member and refreshes the list", async () => {
    vi.mocked(api.teamStaff.create).mockResolvedValue({ ...ada, id: 9 });
    open();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: " Ada " } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+49 170 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff member" }));

    await waitFor(() => expect(api.teamStaff.create).toHaveBeenCalledTimes(1));
    expect(api.teamStaff.create).toHaveBeenCalledWith(1, {
      // The names are trimmed on the way out; the untouched contact fields go
      // as empty strings, which the contract maps to null.
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: "+49 170 1",
      email: "",
      licence: "",
      refereeContact: false,
    });
    expect(swrState.mutate).toHaveBeenCalled();
  });

  it("keeps the add button disabled until both names are filled", () => {
    open();
    const addButton = screen.getByRole("button", { name: "Add staff member" });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ada" } });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
    expect(addButton).toBeEnabled();
  });

  it("shows the empty state when the team has no staff", () => {
    open();
    expect(screen.getByText("No staff for this team yet.")).toBeInTheDocument();
  });
});

describe("TeamStaffDialog edit", () => {
  beforeEach(() => {
    swrState.staff = [ada];
  });

  it("patches only after an edit and sends the whole editable row", async () => {
    vi.mocked(api.teamStaff.update).mockResolvedValue({ ...ada, lastName: "Byron" });
    open();

    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    expect(saveButtons[0]).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("Lovelace"), { target: { value: "Byron" } });
    expect(screen.getAllByRole("button", { name: "Save" })[0]).toBeEnabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => expect(api.teamStaff.update).toHaveBeenCalledTimes(1));
    expect(api.teamStaff.update).toHaveBeenCalledWith(1, 3, {
      firstName: "Ada",
      lastName: "Byron",
      role: "trainer",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
      refereeContact: false,
    });
  });

  it("sends the flipped referee-contact toggle", async () => {
    vi.mocked(api.teamStaff.update).mockResolvedValue({ ...ada, refereeContact: true });
    open();

    // Index 0 is the existing row; the add form below it carries the same label.
    fireEvent.click(screen.getAllByLabelText("Contact for referees")[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => expect(api.teamStaff.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.teamStaff.update).mock.calls[0]![2]).toMatchObject({
      refereeContact: true,
    });
  });

  it("clears a contact field with an empty string", async () => {
    vi.mocked(api.teamStaff.update).mockResolvedValue({ ...ada, phone: null });
    open();

    fireEvent.change(screen.getByDisplayValue("+49 170 1234567"), { target: { value: "" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => expect(api.teamStaff.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.teamStaff.update).mock.calls[0]![2]).toMatchObject({ phone: "" });
  });

  it("removes a staff member and refreshes the list", async () => {
    vi.mocked(api.teamStaff.remove).mockResolvedValue({ success: true });
    open();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(api.teamStaff.remove).toHaveBeenCalledWith(1, 3));
    expect(swrState.mutate).toHaveBeenCalled();
  });
});

describe("TeamStaffDialog without manage permission", () => {
  it("shows the existing staff read-only and offers no add form", () => {
    swrState.staff = [ada];
    renderDialog(false);
    fireEvent.click(screen.getByRole("button", { name: "Staff" }));

    expect(screen.getByDisplayValue("Lovelace")).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Save" })[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Add staff member" }),
    ).not.toBeInTheDocument();
  });
});
