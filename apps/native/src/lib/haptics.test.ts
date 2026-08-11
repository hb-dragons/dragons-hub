import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SOURCE_FILES, importSites, rel, resolveInPackage } from "../../test/source-tree";

const impactAsync = vi.fn((_style: string) => Promise.resolve());
const notificationAsync = vi.fn((_type: string) => Promise.resolve());
const selectionAsync = vi.fn(() => Promise.resolve());

vi.mock("expo-haptics", () => ({
  impactAsync: (style: string) => impactAsync(style),
  notificationAsync: (type: string) => notificationAsync(type),
  selectionAsync: () => selectionAsync(),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
    Soft: "soft",
    Rigid: "rigid",
  },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

import { haptics } from "@/lib/haptics";

beforeEach(() => {
  // Reset rather than clear: the rejection case below installs a failing
  // implementation, and `mockReset` puts the resolving one back.
  vi.resetAllMocks();
});

describe("haptics — notification category (outcome of a task)", () => {
  it("plays the success notification when a task the user asked for completed", () => {
    haptics.success();
    expect(notificationAsync).toHaveBeenCalledWith("success");
    expect(impactAsync).not.toHaveBeenCalled();
    expect(selectionAsync).not.toHaveBeenCalled();
  });

  it("plays the warning notification for a destructive action still undoable", () => {
    haptics.warning();
    expect(notificationAsync).toHaveBeenCalledWith("warning");
  });

  it("plays the error notification when a task failed", () => {
    haptics.error();
    expect(notificationAsync).toHaveBeenCalledWith("error");
  });
});

describe("haptics — selection category (a value changed)", () => {
  it("plays the selection tick and never an impact", () => {
    haptics.selection();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
    expect(impactAsync).not.toHaveBeenCalled();
    expect(notificationAsync).not.toHaveBeenCalled();
  });
});

describe("haptics — impact category (a physical snap)", () => {
  it("plays a medium impact when a drag picks an item up", () => {
    haptics.lift();
    expect(impactAsync).toHaveBeenCalledWith("medium");
    expect(notificationAsync).not.toHaveBeenCalled();
  });

  it("plays a rigid impact when a dragged item lands", () => {
    haptics.drop();
    expect(impactAsync).toHaveBeenCalledWith("rigid");
    expect(notificationAsync).not.toHaveBeenCalled();
  });
});

describe("haptics — surface", () => {
  // The wrapper is named by meaning, not by intensity. A bare `light()` /
  // `medium()` / `heavy()` is what let impact feedback drift onto navigation
  // taps: with no semantic name to reach for, the caller picked a strength.
  it("exposes only the semantic names, no raw impact strengths", () => {
    expect(Object.keys(haptics).sort()).toEqual([
      "drop",
      "error",
      "lift",
      "selection",
      "success",
      "warning",
    ]);
  });

  it("swallows a rejected native call so a haptic never breaks its caller", async () => {
    const boom = new Error("no taptic engine");
    impactAsync.mockRejectedValue(boom);
    notificationAsync.mockRejectedValue(boom);
    selectionAsync.mockRejectedValue(boom);

    expect(() => {
      for (const play of Object.values(haptics)) play();
    }).not.toThrow();

    // Let the rejected promises settle; an unhandled rejection fails the run.
    await Promise.resolve();
    await Promise.resolve();
  });
});

// ---------------------------------------------------------------------------
// Call-site audit
// ---------------------------------------------------------------------------

type HapticName = keyof typeof haptics;

/**
 * Every module allowed to fire a haptic, and the categories it may fire.
 *
 * This is the audit from #218 written down where it stays true: adding a call
 * site means adding a line here, which is the moment to ask which of the three
 * HIG categories the new feedback belongs to — and to notice when the answer
 * is "none of them", the case for cards and list rows that merely navigate.
 */
const HAPTIC_CALL_SITES: Record<string, readonly HapticName[]> = {
  // Value changes.
  "src/components/FilterPill.tsx": ["selection"],
  "src/components/ui/Segmented.tsx": ["selection"],

  // Task outcomes: a claim/unclaim or an admin assignment change either
  // took effect or failed.
  "src/components/ClaimGameButton.tsx": ["success", "error"],
  "src/app/(tabs)/officiating/index.tsx": ["success", "error"],
  "src/app/referee-assign.tsx": ["success", "error"],

  // Board mutations. `warning` is reserved for a destructive action that took
  // effect with undo still on screen; a rejected request is `error`.
  "src/app/admin/boards/[id].tsx": ["warning"],
  "src/components/board/ChecklistSection.tsx": ["success", "warning", "selection"],
  "src/components/board/CommentsSection.tsx": ["warning"],
  "src/app/admin/boards/sheets/quick-create.tsx": ["error"],
  "src/hooks/board/useBoardMutations.ts": ["success", "error"],
  "src/hooks/board/useChecklistMutations.ts": ["error"],
  "src/hooks/board/useColumnMutations.ts": ["success"],
  "src/hooks/board/useMoveTask.ts": ["error"],
  "src/hooks/board/useTaskMutations.ts": ["error"],
  "src/lib/board/with-error-toast.ts": ["error"],

  // Drag gestures — the only place impact belongs. `selection` marks the drop
  // target changing under the finger; the impacts are the lift and the landing.
  "src/hooks/board/useBoardDrag.ts": ["lift", "drop", "selection"],
  "src/hooks/board/useColumnDrag.ts": ["lift", "drop", "selection"],
};

/**
 * The semantic names a file actually calls, deduplicated and sorted. Reading
 * the calls rather than the import keeps the audit honest whichever specifier
 * a file uses to reach the wrapper.
 */
function hapticsCalledBy(relativePath: string): string[] {
  const source = readFileSync(resolveInPackage(relativePath), "utf8");
  const called = new Set<string>();
  const pattern = /\bhaptics\.(\w+)\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) called.add(match[1]!);
  return [...called].sort();
}

describe("haptic call sites", () => {
  it("keeps expo-haptics behind this wrapper, so the semantics cannot be bypassed", () => {
    expect(importSites("expo-haptics")).toEqual(["src/lib/haptics.ts"]);
  });

  it("has no call site outside the audited inventory", () => {
    const firing = SOURCE_FILES.map(rel)
      .filter((file) => file !== "src/lib/haptics.ts")
      .filter((file) => hapticsCalledBy(file).length > 0);
    expect(firing.sort()).toEqual(Object.keys(HAPTIC_CALL_SITES).sort());
  });

  it("fires only the categories its inventory entry declares", () => {
    const actual: Record<string, string[]> = {};
    const declared: Record<string, string[]> = {};
    for (const [file, names] of Object.entries(HAPTIC_CALL_SITES)) {
      actual[file] = hapticsCalledBy(file);
      declared[file] = [...names].sort();
    }
    expect(actual).toEqual(declared);
  });

  // The acceptance criterion from #218, named file by file so a regression
  // reads as what it is rather than as an inventory diff. These components are
  // pure navigation: pressing one pushes a route and nothing else happens.
  it.each([
    "src/components/Card.tsx",
    "src/components/MatchCardCompact.tsx",
    "src/components/MatchCardFull.tsx",
    "src/components/TeamCard.tsx",
    "src/components/RefereeGameCard.tsx",
    "src/components/StandingsTable.tsx",
    "src/components/board/TaskCard.tsx",
  ])("fires no haptic from the navigation tap in %s", (file) => {
    expect(hapticsCalledBy(file)).toEqual([]);
  });
});
