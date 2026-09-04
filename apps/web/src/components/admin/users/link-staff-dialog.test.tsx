// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { StaffPersonWithAssignments, UserListItem } from "@dragons/shared";

const ada: StaffPersonWithAssignments = {
  id: 3,
  firstName: "Ada",
  lastName: "Lovelace",
  phone: null,
  email: null,
  licence: null,
  photoUrl: null,
  assignments: [
    {
      id: 7,
      teamEntryId: 11,
      teamName: "Dragons U16",
      role: "trainer",
      refereeContact: false,
    },
  ],
};

const ben: StaffPersonWithAssignments = {
  id: 4,
  firstName: "Ben",
  lastName: "Byron",
  phone: null,
  email: null,
  licence: null,
  photoUrl: null,
  assignments: [],
};

// The stub *calls* the fetcher, so the search fragment the component passes to
// the API is observable rather than stubbed away.
const swrState = vi.hoisted(() => ({ people: [] as unknown[] }));

vi.mock("swr", () => ({
  default: (key: unknown, fetcher: (key: unknown) => Promise<unknown>) => {
    if (key === null) return { data: undefined, isLoading: false };
    void fetcher(key);
    return { data: swrState.people, isLoading: false };
  },
}));

const linkStaff = vi.fn();
const listPeople = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    staffPeople: { list: (...args: unknown[]) => listPeople(...args) },
    users: { linkStaff: (...args: unknown[]) => linkStaff(...args) },
  },
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { LinkStaffDialog } from "./link-staff-dialog";
import en from "@/messages/en.json";

const user: UserListItem = {
  id: "u1",
  name: "Alice",
  email: "alice@example.com",
  emailVerified: true,
  role: null,
  refereeId: null,
  personId: null,
  banned: false,
  banReason: null,
  banExpires: null,
  image: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  swrState.people = [ada, ben];
  linkStaff.mockResolvedValue({ id: "u1", personId: 3, role: "coach" });
  listPeople.mockResolvedValue([ada, ben]);
});

function renderDialog(onOpenChange = vi.fn(), onLinked = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" timeZone="Europe/Berlin" messages={en}>
      <LinkStaffDialog
        user={user}
        open
        onOpenChange={onOpenChange}
        onLinked={onLinked}
      />
    </NextIntlClientProvider>,
  );
  return { onOpenChange, onLinked };
}

function pickAda() {
  fireEvent.click(screen.getByRole("button", { name: /Lovelace, Ada/ }));
}

describe("<LinkStaffDialog>", () => {
  it("keeps the link button disabled until a person is picked", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();

    pickAda();

    expect(screen.getByRole("button", { name: "Link" })).toBeEnabled();
  });

  // Two coaches can share a name; the teams are what tells them apart.
  it("shows each person's teams, and says so when they have none", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: /Lovelace, Ada/ })).toHaveTextContent(
      "Dragons U16",
    );
    expect(screen.getByRole("button", { name: /Byron, Ben/ })).toHaveTextContent(
      en.users.linkStaffDialog.noTeams,
    );
  });

  it("searches the pool by the typed fragment", async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(en.users.linkStaffDialog.searchPlaceholder), {
      target: { value: "love" },
    });

    await waitFor(() => expect(listPeople).toHaveBeenCalledWith("love"));
  });

  it("lists the whole pool before anything is typed", () => {
    renderDialog();

    expect(listPeople).toHaveBeenCalledWith(undefined);
  });

  it("sends the person id with the coach grant on by default", async () => {
    const { onLinked, onOpenChange } = renderDialog();

    pickAda();
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() =>
      expect(linkStaff).toHaveBeenCalledWith("u1", {
        personId: 3,
        grantCoachRole: true,
      }),
    );
    expect(toastMock.success).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onLinked).toHaveBeenCalled();
  });

  it("sends grantCoachRole: false when the checkbox is cleared", async () => {
    renderDialog();

    fireEvent.click(screen.getByRole("checkbox"));
    pickAda();
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() =>
      expect(linkStaff).toHaveBeenCalledWith("u1", {
        personId: 3,
        grantCoachRole: false,
      }),
    );
  });

  it("keeps the dialog open and reports a failed link", async () => {
    linkStaff.mockRejectedValue(new Error("409"));
    const { onLinked, onOpenChange } = renderDialog();

    pickAda();
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("shows the empty state when the search matches nobody", () => {
    swrState.people = [];
    renderDialog();

    expect(screen.getByText(en.users.linkStaffDialog.noResults)).toBeInTheDocument();
  });
});
