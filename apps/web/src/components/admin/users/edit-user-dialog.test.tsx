// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

const updateUserMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/auth-client", () => ({
  authClient: { admin: { updateUser: (...a: unknown[]) => updateUserMock(...a) } },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EditUserDialog } from "./edit-user-dialog";
import type { UserListItem } from "./types";

const user: UserListItem = {
  id: "u1",
  name: "Alice",
  email: "alice@example.com",
  role: null,
  emailVerified: true,
  banned: false,
  createdAt: new Date().toISOString(),
} as unknown as UserListItem;

describe("<EditUserDialog> field labelling", () => {
  afterEach(cleanup);

  it("programmatically associates each FieldLabel with its input", () => {
    render(
      <EditUserDialog user={user} open onOpenChange={vi.fn()} onUpdated={vi.fn()} />,
    );

    // getByLabelText only succeeds when the label is actually wired to the
    // control via htmlFor/id (or aria-labelledby) — a visually-adjacent but
    // unassociated <label> would fail this exact query.
    expect(screen.getByLabelText("users.editDialog.nameLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("users.editDialog.emailLabel")).toBeInTheDocument();
  });

  it("announces a validation error via role=alert instead of silent text", async () => {
    render(
      <EditUserDialog user={user} open onOpenChange={vi.fn()} onUpdated={vi.fn()} />,
    );

    const nameInput = screen.getByLabelText("users.editDialog.nameLabel");
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.blur(nameInput);
    fireEvent.click(screen.getByRole("button", { name: "users.editDialog.update" }));

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert).toHaveTextContent("users.validation.nameRequired");
  });
});
