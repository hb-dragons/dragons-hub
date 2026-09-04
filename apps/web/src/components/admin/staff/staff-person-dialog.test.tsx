// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { StaffPerson } from "@dragons/shared";

const ada: StaffPerson = {
  id: 20,
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+49 170 1234567",
  email: "ada@example.de",
  licence: "C-Lizenz",
  photoUrl: null,
};

vi.mock("@/lib/api", () => ({
  api: {
    staffPeople: { create: vi.fn(), update: vi.fn(), uploadPhoto: vi.fn() },
  },
}));

import { StaffPersonDialog } from "./staff-person-dialog";
import { api } from "@/lib/api";
import en from "@/messages/en.json";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function renderDialog(person: StaffPerson | null, onSaved = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" timeZone="Europe/Berlin" messages={en}>
      <StaffPersonDialog
        person={person}
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />
    </NextIntlClientProvider>,
  );
  return { onSaved, onOpenChange };
}

describe("<StaffPersonDialog>", () => {
  it("sends a trimmed create body and closes on success", async () => {
    vi.mocked(api.staffPeople.create).mockResolvedValue(ada);
    const { onSaved, onOpenChange } = renderDialog(null);

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: " Ada " } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.staffPeople.create).toHaveBeenCalledWith({
        firstName: "Ada",
        lastName: "Lovelace",
        phone: "",
        email: "",
        licence: "",
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(ada);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps Save disabled until both names are filled", () => {
    renderDialog(null);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  /** `""` is what clears a contact field; the contract maps it to null. */
  it("sends an empty string for a cleared contact field", async () => {
    vi.mocked(api.staffPeople.update).mockResolvedValue({ ...ada, phone: null });
    renderDialog(ada);

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.staffPeople.update).toHaveBeenCalledWith(20, {
        firstName: "Ada",
        lastName: "Lovelace",
        phone: "",
        email: "ada@example.de",
        licence: "C-Lizenz",
      }),
    );
  });

  it("keeps the dialog open and reports a failed save", async () => {
    vi.mocked(api.staffPeople.update).mockRejectedValue(new Error("500"));
    const { onOpenChange } = renderDialog(ada);

    fireEvent.change(screen.getByLabelText("Licence"), { target: { value: "B-Lizenz" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByText(en.staffPeople.saveFailed)).toBeInTheDocument(),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  // The upload needs a person id to attach to, so a create form has no portrait
  // control at all.
  it("offers the portrait only for a person that exists", () => {
    renderDialog(null);
    expect(screen.queryByRole("button", { name: "Upload portrait" })).toBeNull();

    cleanup();
    renderDialog(ada);
    expect(screen.getByRole("button", { name: "Upload portrait" })).toBeInTheDocument();
  });

  it("uploads a picked portrait and hands the updated person back", async () => {
    const withPhoto = { ...ada, photoUrl: "/admin/staff-people/20/photo?v=a.png" };
    vi.mocked(api.staffPeople.uploadPhoto).mockResolvedValue(withPhoto);
    const { onSaved } = renderDialog(ada);

    const file = new File([new Uint8Array([1])], "p.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Portrait"), { target: { files: [file] } });

    await waitFor(() => expect(api.staffPeople.uploadPhoto).toHaveBeenCalledWith(20, file));
    expect(onSaved).toHaveBeenCalledWith(withPhoto);
  });

  it("reports a rejected upload instead of failing silently", async () => {
    vi.mocked(api.staffPeople.uploadPhoto).mockRejectedValue(new Error("400"));
    renderDialog(ada);

    fireEvent.change(screen.getByLabelText("Portrait"), {
      target: { files: [new File([], "p.png", { type: "image/png" })] },
    });

    await waitFor(() =>
      expect(screen.getByText(en.teams.staff.portraitFailed)).toBeInTheDocument(),
    );
  });
});
