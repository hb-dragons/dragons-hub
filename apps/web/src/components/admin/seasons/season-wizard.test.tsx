// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { browse, create, setLeagues, trigger, toastError, toastSuccess } = vi.hoisted(() => ({
  browse: vi.fn(),
  create: vi.fn(),
  setLeagues: vi.fn(),
  trigger: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    seasons: { browse, create, setLeagues, discover: vi.fn() },
    sync: { trigger },
  },
}));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { SeasonWizard } from "./season-wizard";

const LEAGUES = [
  { ligaId: 1, ligaNr: null, name: "Oberliga Herren Ost", skName: "Oberliga", akName: "Senioren", geschlecht: "männlich", vorabliga: true, alreadyTracked: false },
  { ligaId: 2, ligaNr: null, name: "Landesliga Damen", skName: "Landesliga", akName: "Senioren", geschlecht: "weiblich", vorabliga: true, alreadyTracked: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  browse.mockResolvedValue(LEAGUES);
  create.mockResolvedValue({ id: 9, name: "2026/27", status: "upcoming" });
  setLeagues.mockResolvedValue({ tracked: 1, untracked: 0 });
  trigger.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

function nameAndAdvance(value = "2026/27") {
  fireEvent.change(screen.getByLabelText("settings.seasons.wizard.nameLabel"), { target: { value } });
  fireEvent.click(screen.getByText("settings.seasons.wizard.next"));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("SeasonWizard", () => {
  it("browses vorabliga leagues after naming the season, without creating it yet", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await waitFor(() => expect(browse).toHaveBeenCalledWith({ vorabligaOnly: true }));
    expect(await screen.findByText("Oberliga Herren Ost")).toBeInTheDocument();
    // Discover-before-create: advancing must not persist a season.
    expect(create).not.toHaveBeenCalled();
  });

  it("creates the season, saves the picked leagues and syncs only on confirm", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "2026/27" }));
    expect(setLeagues).toHaveBeenCalledWith(9, { ligaIds: [1] });
    await waitFor(() => expect(trigger).toHaveBeenCalled());
    expect(await screen.findByText("settings.seasons.wizard.done")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("settings.seasons.wizard.synced");
  });

  it("shows an error and stays on the name step when discovery fails", async () => {
    browse.mockRejectedValueOnce(new Error("boom"));
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("settings.seasons.wizard.discoverFailed"),
    );
    expect(screen.getByLabelText("settings.seasons.wizard.nameLabel")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("reports a create failure without advancing past selection", async () => {
    create.mockRejectedValueOnce(new Error("boom"));
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("settings.seasons.wizard.createFailed"),
    );
    expect(trigger).not.toHaveBeenCalled();
    expect(screen.getByText("settings.seasons.wizard.confirm")).toBeInTheDocument();
  });

  it("shows a loading indicator while leagues are being fetched", async () => {
    const d = deferred<typeof LEAGUES>();
    browse.mockReturnValueOnce(d.promise);
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    expect(
      await screen.findByText("settings.seasons.wizard.loadingLeagues"),
    ).toBeInTheDocument();
    d.resolve(LEAGUES);
    expect(await screen.findByText("Oberliga Herren Ost")).toBeInTheDocument();
    expect(
      screen.queryByText("settings.seasons.wizard.loadingLeagues"),
    ).not.toBeInTheDocument();
  });

  it("shows the syncing step while the background sync is kicked off", async () => {
    const d = deferred<{ ok: boolean }>();
    trigger.mockReturnValueOnce(d.promise);
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    expect(await screen.findByText("settings.seasons.wizard.syncing")).toBeInTheDocument();
    d.resolve({ ok: true });
    expect(await screen.findByText("settings.seasons.wizard.done")).toBeInTheDocument();
  });

  it("ignores a fetch that resolves after the dialog was closed", async () => {
    const d = deferred<typeof LEAGUES>();
    browse.mockReturnValueOnce(d.promise);
    const { rerender } = render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("settings.seasons.wizard.loadingLeagues");
    // Parent closes the dialog mid-fetch; the late rejection must not toast.
    rerender(<SeasonWizard open={false} onOpenChange={() => {}} />);
    d.reject(new Error("late"));
    await d.promise.catch(() => {});
    await Promise.resolve();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reuses the created season on retry instead of creating a duplicate", async () => {
    setLeagues.mockRejectedValueOnce(new Error("save failed"));
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("settings.seasons.wizard.createFailed"),
    );
    expect(create).toHaveBeenCalledTimes(1);
    // Retry: setLeagues now succeeds; the season must not be created again.
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    await waitFor(() => expect(trigger).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(1);
    expect(setLeagues).toHaveBeenLastCalledWith(9, { ligaIds: [1] });
  });

  it("filters the league list by search query", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.change(screen.getByLabelText("settings.seasons.wizard.searchPlaceholder"), {
      target: { value: "damen" },
    });
    expect(screen.queryByText("Oberliga Herren Ost")).not.toBeInTheDocument();
    expect(screen.getByText("Landesliga Damen")).toBeInTheDocument();
  });
});
