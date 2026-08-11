// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { browse, create, setLeagues, trigger, syncLogs, summary, toastError, toastSuccess } =
  vi.hoisted(() => ({
    browse: vi.fn(),
    create: vi.fn(),
    setLeagues: vi.fn(),
    trigger: vi.fn(),
    syncLogs: vi.fn(),
    summary: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
  }));

vi.mock("@/lib/api", () => ({
  api: {
    seasons: { browse, create, setLeagues, summary, discover: vi.fn(), leagueTeams: vi.fn() },
    sync: { trigger, logs: syncLogs },
  },
}));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

// The real component opens an EventSource; the wizard only needs its
// onComplete callback, so stand in a button that fires it on demand.
vi.mock("@/components/admin/sync/sync-live-logs", () => ({
  SyncLiveLogs: ({ syncRunId, onComplete }: { syncRunId: number; onComplete: () => void }) => (
    <button data-testid="live-logs" data-run-id={syncRunId} onClick={onComplete}>
      live
    </button>
  ),
}));

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
  trigger.mockResolvedValue({ jobId: "j1", syncRunId: 77, status: "queued", message: "" });
  syncLogs.mockResolvedValue({ items: [{ id: 77, status: "completed" }] });
  summary.mockResolvedValue({ leagueCount: 1, gameCount: 12, placeholderSlots: 0 });
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
  it("browses our club's vorabliga leagues after naming the season, without creating it yet", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    // Defaults to the club filter on.
    await waitFor(() =>
      expect(browse).toHaveBeenCalledWith({ vorabligaOnly: true, ownClubOnly: true }),
    );
    expect(await screen.findByText("Oberliga Herren Ost")).toBeInTheDocument();
    // Discover-before-create: advancing must not persist a season.
    expect(create).not.toHaveBeenCalled();
  });

  it("re-browses without the club filter when the toggle is switched off", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("settings.seasons.wizard.ownClubOnly"));
    await waitFor(() =>
      expect(browse).toHaveBeenLastCalledWith({ vorabligaOnly: true, ownClubOnly: false }),
    );
  });

  it("creates the season, saves the picked leagues and syncs only on confirm", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    // Both dates are optional and left blank here, so they go over as null.
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: "2026/27",
        startDate: null,
        endDate: null,
      }),
    );
    expect(setLeagues).toHaveBeenCalledWith(9, { ligaIds: [1] });
    await waitFor(() => expect(trigger).toHaveBeenCalled());
    expect(await screen.findByTestId("live-logs")).toBeInTheDocument();
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

  it("shows a bare spinner until the trigger response names the run", async () => {
    const d = deferred<{ jobId: string; syncRunId: number; status: string; message: string }>();
    trigger.mockReturnValueOnce(d.promise);
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    expect(await screen.findByText("settings.seasons.wizard.syncing")).toBeInTheDocument();
    d.resolve({ jobId: "j1", syncRunId: 77, status: "queued", message: "" });
    expect(await screen.findByTestId("live-logs")).toBeInTheDocument();
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

  it("streams the triggered run's log instead of a bare spinner", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    const logs = await screen.findByTestId("live-logs");
    // The run id from trigger() reaches the log stream rather than being dropped.
    expect(logs).toHaveAttribute("data-run-id", "77");
  });

  it("stays on the sync step when the stream completes before the run does", async () => {
    // The SSE 'complete' event can arrive before the job starts processing.
    syncLogs.mockResolvedValue({ items: [{ id: 77, status: "running" }] });
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    fireEvent.click(await screen.findByTestId("live-logs"));

    await waitFor(() => expect(syncLogs).toHaveBeenCalled());
    expect(screen.queryByText("settings.seasons.wizard.close")).not.toBeInTheDocument();
    expect(summary).not.toHaveBeenCalled();
  });

  it("advances to the review once the run reaches a terminal status", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    fireEvent.click(await screen.findByTestId("live-logs"));

    await screen.findByText("settings.seasons.wizard.close");
    expect(summary).toHaveBeenCalledWith(9);
  });

  it("still reaches the review when the sync could not be triggered", async () => {
    trigger.mockRejectedValue(new Error("queue down"));
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    // Season and leagues are saved; only the sync kick-off failed.
    await screen.findByText("settings.seasons.wizard.close");
    expect(toastError).toHaveBeenCalledWith("settings.seasons.wizard.syncFailed");
  });

  it("keeps the dialog shut while committing but releases it once the sync starts", async () => {
    const pending = deferred<{ tracked: number; untracked: number }>();
    setLeagues.mockReturnValue(pending.promise);
    const onOpenChange = vi.fn();
    render(<SeasonWizard open onOpenChange={onOpenChange} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    // Mid-commit: an interrupted commit would orphan the created season.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    pending.resolve({ tracked: 1, untracked: 0 });
    await screen.findByTestId("live-logs");

    // Syncing: the work is committed and the sync continues server-side, so the
    // admin must not be held in the modal for its whole duration.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
