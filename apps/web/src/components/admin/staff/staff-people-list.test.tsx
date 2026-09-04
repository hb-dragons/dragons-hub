// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { StaffPersonWithAssignments } from "@dragons/shared";

const ada: StaffPersonWithAssignments = {
  id: 20,
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+49 170 1234567",
  email: "ada@example.de",
  licence: "C-Lizenz",
  photoUrl: null,
  assignments: [
    { id: 3, teamEntryId: 1, teamName: "Dragons U16", role: "trainer", refereeContact: true },
    { id: 4, teamEntryId: 2, teamName: "Dragons U18", role: "co_trainer", refereeContact: false },
  ],
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

// The stub calls the fetcher, so the search fragment the list passes to the API
// is observable rather than stubbed away.
const swrState = vi.hoisted(() => ({ people: [] as unknown[], mutate: vi.fn() }));

vi.mock("swr", () => ({
  default: (key: unknown, fetcher: (key: unknown) => Promise<unknown>) => {
    void fetcher(key);
    return { data: swrState.people, mutate: swrState.mutate };
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    staffPeople: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      uploadPhoto: vi.fn(),
    },
  },
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { APIError } from "@dragons/api-client";
import { StaffPeopleList } from "./staff-people-list";
import { api } from "@/lib/api";
import en from "@/messages/en.json";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  swrState.people = [ada, ben];
  swrState.mutate.mockResolvedValue(undefined);
});

function renderList(canManage = true) {
  render(
    <NextIntlClientProvider locale="en" timeZone="Europe/Berlin" messages={en}>
      <StaffPeopleList canManage={canManage} />
    </NextIntlClientProvider>,
  );
}

describe("<StaffPeopleList>", () => {
  it("lists every person with the teams they hold", () => {
    renderList();

    expect(screen.getByText("Lovelace, Ada")).toBeInTheDocument();
    expect(
      screen.getByText("Dragons U16 (Coach), Dragons U18 (Assistant coach)"),
    ).toBeInTheDocument();
    expect(screen.getByText(en.staffPeople.noTeams)).toBeInTheDocument();
  });

  it("searches the pool by the typed fragment", async () => {
    renderList();

    fireEvent.change(screen.getByLabelText(en.staffPeople.searchPlaceholder), {
      target: { value: "love" },
    });

    await waitFor(() => expect(api.staffPeople.list).toHaveBeenCalledWith("love"));
  });

  it("deletes a person and refreshes the list", async () => {
    vi.mocked(api.staffPeople.remove).mockResolvedValue({ success: true });
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Delete person Ben Byron" }));

    await waitFor(() => expect(api.staffPeople.remove).toHaveBeenCalledWith(21));
    expect(swrState.mutate).toHaveBeenCalled();
  });

  // The API answers 409 while the person still holds an assignment; the admin
  // has to be told why nothing happened.
  it("says why a delete the API refused with 409 did nothing", async () => {
    vi.mocked(api.staffPeople.remove).mockRejectedValue(
      new APIError(409, "STAFF_PERSON_ASSIGNED", "still attached"),
    );
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Delete person Ada Lovelace" }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(en.staffPeople.deleteBlocked),
    );
  });

  // A network failure is not the API refusing, so it must not claim the person
  // is attached to a team.
  it("reports any other failure without inventing a reason", async () => {
    vi.mocked(api.staffPeople.remove).mockRejectedValue(new Error("network"));
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Delete person Ada Lovelace" }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(en.staffPeople.deleteFailed),
    );
  });

  it("edits a person through the shared editor", async () => {
    vi.mocked(api.staffPeople.update).mockResolvedValue({ ...ada, lastName: "Byron" });
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Edit person Ada Lovelace" }));
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Byron" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.staffPeople.update).toHaveBeenCalledWith(20, {
        firstName: "Ada",
        lastName: "Byron",
        phone: "+49 170 1234567",
        email: "ada@example.de",
        licence: "C-Lizenz",
      }),
    );
    expect(swrState.mutate).toHaveBeenCalled();
  });

  it("creates a person from an empty form", async () => {
    vi.mocked(api.staffPeople.create).mockResolvedValue(ben);
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Zoe" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Zander" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.staffPeople.create).toHaveBeenCalledWith({
        firstName: "Zoe",
        lastName: "Zander",
        phone: "",
        email: "",
        licence: "",
      }),
    );
  });

  it("shows the empty state when the pool is empty", () => {
    swrState.people = [];
    renderList();

    expect(screen.getByText(en.staffPeople.empty)).toBeInTheDocument();
  });

  it("offers no edit, delete or add without manage permission", () => {
    renderList(false);

    expect(screen.getByText("Lovelace, Ada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add person" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit person/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete person/ })).toBeNull();
  });
});
