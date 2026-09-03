// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OwnClubTeam, TeamStaffMember, UserListItem } from "@dragons/shared";

const teams: OwnClubTeam[] = [
  {
    id: 11,
    teamId: 1,
    name: "Dragons U16",
    nameShort: null,
    customName: null,
    leagueId: null,
    leagueName: null,
    leagueTracked: true,
    linkSource: "seeded",
    estimatedGameDuration: null,
    badgeColor: null,
    displayOrder: 0,
  },
];

const ada: TeamStaffMember = {
  id: 3,
  teamEntryId: 11,
  firstName: "Ada",
  lastName: "Lovelace",
  role: "trainer",
  phone: null,
  email: null,
  licence: null,
  photoUrl: null,
  refereeContact: false,
};

// The component keys its two fetches by a literal ("link-staff-teams") and a
// tuple (["link-staff-members", entryId]); the stub answers by shape so the
// team list and the staff list cannot be confused for one another.
const swrState = vi.hoisted(() => ({
  staff: [] as unknown[],
}));

vi.mock("swr", () => ({
  default: (key: unknown, fetcher: () => Promise<unknown>) => {
    if (key === null) return { data: undefined, isLoading: false };
    if (Array.isArray(key)) return { data: swrState.staff, isLoading: false };
    void fetcher;
    return { data: teams, isLoading: false };
  },
}));

const linkStaff = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    teams: { list: vi.fn() },
    teamStaff: { list: vi.fn() },
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
  staffId: null,
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
  swrState.staff = [ada];
  linkStaff.mockResolvedValue({ id: "u1", staffId: 3, role: "coach" });
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

/** Pick the team, then the staff member — the staff list only exists after a team. */
function pickAda() {
  fireEvent.click(screen.getByRole("button", { name: "Dragons U16" }));
  fireEvent.click(screen.getByRole("button", { name: /Lovelace, Ada/ }));
}

describe("<LinkStaffDialog>", () => {
  it("keeps the link button disabled until a staff member is picked", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();

    pickAda();

    expect(screen.getByRole("button", { name: "Link" })).toBeEnabled();
  });

  it("lists no staff before a team is picked", () => {
    renderDialog();

    expect(screen.queryByRole("button", { name: /Lovelace, Ada/ })).toBeNull();
  });

  it("sends the staff id with the coach grant on by default", async () => {
    const { onLinked, onOpenChange } = renderDialog();

    pickAda();
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() =>
      expect(linkStaff).toHaveBeenCalledWith("u1", {
        staffId: 3,
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
        staffId: 3,
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

  it("shows the empty state for a team with no staff", () => {
    swrState.staff = [];
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Dragons U16" }));

    expect(
      screen.getByText(en.users.linkStaffDialog.noResults),
    ).toBeInTheDocument();
  });

  // Switching teams must drop a selection made in the previous team, or the
  // link button would submit a staff member the admin can no longer see.
  it("clears the picked staff member when the team changes", () => {
    renderDialog();

    pickAda();
    fireEvent.click(screen.getByRole("button", { name: "Dragons U16" }));

    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();
  });
});
