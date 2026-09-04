// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { StaffPersonWithAssignments, TeamStaffMember } from "@dragons/shared";

const ada: TeamStaffMember = {
  id: 3,
  teamEntryId: 1,
  personId: 20,
  firstName: "Ada",
  lastName: "Lovelace",
  role: "trainer",
  phone: "+49 170 1234567",
  email: "ada@example.de",
  licence: "C-Lizenz",
  photoUrl: null,
  refereeContact: false,
};

const ben: StaffPersonWithAssignments = {
  id: 21,
  firstName: "Ben",
  lastName: "Byron",
  phone: null,
  email: null,
  licence: null,
  photoUrl: null,
  assignments: [],
};

const adaPerson: StaffPersonWithAssignments = {
  id: 20,
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+49 170 1234567",
  email: "ada@example.de",
  licence: "C-Lizenz",
  photoUrl: null,
  assignments: [
    { id: 3, teamEntryId: 1, teamName: "Dragons U16", role: "trainer", refereeContact: false },
  ],
};

/**
 * Two lists share one stub: the team's assignments, keyed by the staff URL, and
 * the pool, keyed by the staff-people URL. Answering by key shape keeps the two
 * from being confused for one another.
 */
const swrState = vi.hoisted(() => ({
  staff: [] as unknown[],
  pool: [] as unknown[],
  mutate: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (key: string | null) => {
    if (key === null) return { data: undefined, mutate: swrState.mutate };
    if (key.includes("staff-people")) return { data: swrState.pool, mutate: swrState.mutate };
    return { data: swrState.staff, mutate: swrState.mutate };
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    teamStaff: {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    staffPeople: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      uploadPhoto: vi.fn(),
    },
  },
}));

import { TeamStaffDialog } from "./team-staff-dialog";
import { api } from "@/lib/api";
import en from "@/messages/en.json";

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  swrState.staff = [];
  swrState.pool = [adaPerson, ben];
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
function open(canManage = true) {
  renderDialog(canManage);
  fireEvent.click(screen.getByRole("button", { name: "Staff" }));
}

describe("TeamStaffDialog add", () => {
  it("attaches a person picked from the pool", async () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: /Byron, Ben/ }));

    await waitFor(() =>
      expect(api.teamStaff.create).toHaveBeenCalledWith(1, {
        personId: 21,
        role: "trainer",
      }),
    );
    expect(swrState.mutate).toHaveBeenCalled();
  });

  // A coach already on this team must not be offered again — the API answers
  // 409, and re-adding them is never what the admin meant.
  it("leaves out people already attached to this team", () => {
    swrState.staff = [ada];
    open();

    expect(screen.queryByRole("button", { name: /Lovelace, Ada/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Byron, Ben/ })).toBeInTheDocument();
  });

  // Story 2 of the spec: entering a coach the club does not know yet — contact
  // data included — stays one dialog.
  it("creates a new person inline, with contact data, and attaches them in one call", async () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "New person" }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: " Zoe " } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Zander" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+49 170 1" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "zoe@example.de" } });
    fireEvent.change(screen.getByLabelText("Licence"), { target: { value: "C-Lizenz" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff member" }));

    await waitFor(() =>
      expect(api.teamStaff.create).toHaveBeenCalledWith(1, {
        person: {
          firstName: "Zoe",
          lastName: "Zander",
          phone: "+49 170 1",
          email: "zoe@example.de",
          licence: "C-Lizenz",
        },
        role: "trainer",
      }),
    );
  });

  it("keeps the inline add button disabled until both names are filled", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "New person" }));

    expect(screen.getByRole("button", { name: "Add staff member" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Zoe" } });
    expect(screen.getByRole("button", { name: "Add staff member" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Zander" } });
    expect(screen.getByRole("button", { name: "Add staff member" })).toBeEnabled();
  });

  it("shows the empty state when the team has no staff", () => {
    open();
    expect(screen.getByText(en.teams.staff.empty)).toBeInTheDocument();
  });
});

describe("TeamStaffDialog rows", () => {
  it("patches the role and the flag, and nothing else", async () => {
    swrState.staff = [ada];
    open();

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.teamStaff.update).toHaveBeenCalledWith(1, 3, {
        role: "trainer",
        refereeContact: true,
      }),
    );
    expect(swrState.mutate).toHaveBeenCalled();
  });

  it("keeps Save disabled until something on the row changes", () => {
    swrState.staff = [ada];
    open();

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows the person's contact data read-only on the row", () => {
    swrState.staff = [ada];
    open();

    expect(screen.getByText(/\+49 170 1234567/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Phone")).toBeNull();
  });

  // The phone number belongs to the person, so editing it is the shared editor
  // — a team-local field would be exactly the duplication ADR 0009 removed.
  it("opens the person editor for the row's person", async () => {
    swrState.staff = [ada];
    open();

    fireEvent.click(screen.getByRole("button", { name: "Edit person Ada Lovelace" }));

    expect(screen.getByLabelText("Phone")).toHaveValue("+49 170 1234567");

    vi.mocked(api.staffPeople.update).mockResolvedValue({ ...adaPerson, phone: "+49 222" });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+49 222" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.staffPeople.update).toHaveBeenCalledWith(20, {
        firstName: "Ada",
        lastName: "Lovelace",
        phone: "+49 222",
        email: "ada@example.de",
        licence: "C-Lizenz",
      }),
    );
  });

  it("removes an assignment and refreshes the list", async () => {
    swrState.staff = [ada];
    open();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(api.teamStaff.remove).toHaveBeenCalledWith(1, 3));
    expect(swrState.mutate).toHaveBeenCalled();
  });
});

describe("TeamStaffDialog without manage permission", () => {
  it("shows the staff read-only and offers no add form", () => {
    swrState.staff = [ada];
    open(false);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New person" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit person Ada Lovelace" })).toBeDisabled();
  });
});
