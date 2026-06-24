// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { create, discover } = vi.hoisted(() => {
  const create = vi.fn().mockResolvedValue({ id: 9, name: "2026/27", status: "upcoming" });
  const discover = vi.fn().mockResolvedValue([
    { ligaId: 54136, ligaNr: null, name: "Oberliga Herren Ost", skName: "Oberliga", akName: "Senioren", geschlecht: "männlich", vorabliga: true, alreadyTracked: false },
  ]);
  return { create, discover };
});

vi.mock("@/lib/api", () => ({
  api: {
    seasons: { create, discover, setLeagues: vi.fn().mockResolvedValue({ tracked: 1, untracked: 0 }) },
    sync: { trigger: vi.fn().mockResolvedValue({ ok: true }) },
  },
}));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SeasonWizard } from "./season-wizard";

describe("SeasonWizard", () => {
  it("creates a season then loads vorabligas to pick", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("settings.seasons.wizard.nameLabel"), { target: { value: "2026/27" } });
    fireEvent.click(screen.getByText("settings.seasons.wizard.next"));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "2026/27" }));
    await waitFor(() => expect(discover).toHaveBeenCalledWith(9, { vorabligaOnly: true }));
    expect(await screen.findByText(/Oberliga Herren Ost/)).toBeInTheDocument();
  });
});
