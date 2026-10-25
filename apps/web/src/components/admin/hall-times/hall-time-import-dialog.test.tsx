// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import * as XLSX from "xlsx";
import type { HallTimeImportPreview, VenueListItem } from "@dragons/shared";

const mocks = vi.hoisted(() => ({
  previewHallTimeImport: vi.fn(),
  importHallTimes: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    venues: {
      previewHallTimeImport: mocks.previewHallTimeImport,
      importHallTimes: mocks.importHallTimes,
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: mocks.toastInfo },
}));

import { HallTimeImportDialog } from "./hall-time-import-dialog";
import de from "@/messages/de.json";

const formats = {
  dateTime: {
    matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" },
    matchTime: { hour: "2-digit", minute: "2-digit" },
  },
} as const;

const venues: VenueListItem[] = [
  { id: 4, apiId: 40, name: "Friedrich-Ebert-Schule", street: null, postalCode: null, city: "Hannover", latitude: null, longitude: null },
  { id: 7, apiId: 70, name: "Gymnasium Goetheschule", street: null, postalCode: null, city: "Hannover", latitude: null, longitude: null },
];

/** A real .xlsx built the way the city's sheet is laid out, through the same library the dialog reads with. */
function anlageT(hallName: string): File {
  const grid = [
    [null, "Anlage T zum Mietantrag", null, null, null, null, null, null, null, "Datum dieser Aktualisierung:", "9/14/26"],
    [],
    [null, "Sporthalle:", null, null, hallName],
    [],
    [],
    [null, null, "Tag", "Datum", "von", "-", "bis", null, "Tag", "Datum", "von", "-", "bis"],
    [null, null, "Sa", "9/19/26", "10:00", "-", "22:00", null, "Sa", "1/23/27", "10:00", "-", "14:00"],
    [null, null, "So", "9/20/26", null, "-", null, null, "So", "1/24/27", null, "Ferien", null],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(grid), "Tabelle1");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], "T-Test.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const preview: HallTimeImportPreview = {
  span: { from: "2026-09-19", to: "2027-01-24" },
  added: [
    { date: "2026-09-19", kind: "open", startTime: "10:00", endTime: "22:00", note: null },
    { date: "2027-01-24", kind: "closed", startTime: null, endTime: null, note: "Ferien" },
  ],
  changed: [],
  removed: [],
  unchanged: 1,
};

function renderDialog(onImported = vi.fn()) {
  render(
    <NextIntlClientProvider locale="de" timeZone="Europe/Berlin" messages={de} formats={formats}>
      <HallTimeImportDialog open onOpenChange={vi.fn()} venues={venues} onImported={onImported} />
    </NextIntlClientProvider>,
  );
  return { onImported };
}

async function pickFile(file: File) {
  const input = screen.getByLabelText(de.hallTimes.import.file) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await screen.findByTestId("import-parsed");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HallTimeImportDialog", () => {
  it("reads the sheet, names the hall and day count, and preselects the matching venue", async () => {
    renderDialog();
    await pickFile(anlageT("Gymnasium Goetheschule"));

    expect(screen.getByTestId("import-parsed")).toHaveTextContent("3 Tage gelesen aus „Gymnasium Goetheschule“");
    expect(screen.getByTestId("import-parsed")).toHaveTextContent("Stand");
    expect(screen.getByDisplayValue("Gymnasium Goetheschule")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: de.hallTimes.import.preview })).toBeEnabled();
  });

  it("previews against the picked venue and applies, reporting the venue back", async () => {
    mocks.previewHallTimeImport.mockResolvedValue(preview);
    mocks.importHallTimes.mockResolvedValue(preview);
    const { onImported } = renderDialog();
    await pickFile(anlageT("Gymnasium Goetheschule"));

    fireEvent.click(screen.getByRole("button", { name: de.hallTimes.import.preview }));
    await screen.findByTestId("import-preview");

    expect(mocks.previewHallTimeImport).toHaveBeenCalledWith(7, {
      rows: [
        { date: "2026-09-19", kind: "open", startTime: "10:00", endTime: "22:00", note: null },
        { date: "2027-01-23", kind: "open", startTime: "10:00", endTime: "14:00", note: null },
        { date: "2027-01-24", kind: "closed", startTime: null, endTime: null, note: "Ferien" },
      ],
    });
    expect(screen.getByText(de.hallTimes.import.added)).toBeInTheDocument();
    expect(screen.getByText(/1 Tag unverändert/)).toBeInTheDocument();
    expect(screen.queryByText(/Betroffene Buchungen/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: de.hallTimes.import.apply }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(7));
    expect(mocks.importHallTimes).toHaveBeenCalledWith(7, { rows: expect.any(Array) });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(de.hallTimes.import.imported);
    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });

  it("leaves the venue empty and the preview disabled when no venue matches the hall name", async () => {
    renderDialog();
    await pickFile(anlageT("Unbekannte Halle"));

    expect(screen.queryByDisplayValue("Unbekannte Halle")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: de.hallTimes.import.preview })).toBeDisabled();
  });

  it("says so when the preview finds nothing to change", async () => {
    mocks.previewHallTimeImport.mockResolvedValue({ ...preview, added: [], unchanged: 3 });
    renderDialog();
    await pickFile(anlageT("Friedrich-Ebert-Schule"));

    fireEvent.click(screen.getByRole("button", { name: de.hallTimes.import.preview }));
    await screen.findByTestId("import-preview");

    expect(screen.getByText(de.hallTimes.import.noChanges)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: de.hallTimes.import.apply })).not.toBeInTheDocument();
  });

  it("reports a file it cannot read", async () => {
    renderDialog();
    const input = screen.getByLabelText(de.hallTimes.import.file) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["not a workbook"], "x.xlsx")] } });
    });

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(de.hallTimes.import.parseFailed));
  });
});
