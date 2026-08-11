import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TaskCard.tsx is a React Native component module: importing it pulls in the
// whole RN/reanimated/gesture-handler stack at module load. The suite runs in a
// node environment with no RN runtime, so those are stubbed here. This file
// exists as a `.tsx` on purpose — it is the proof that `test.include` collects
// component tests, which it could not before 2026-07-26.
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("expo-symbols", () => ({ SymbolView: "SymbolView" }));
vi.mock("react-native-gesture-handler", () => ({
  Gesture: { Pan: () => ({ onBegin: () => ({}) }) },
  GestureDetector: "GestureDetector",
}));
vi.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  default: "Swipeable",
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: "Animated.View",
    createAnimatedComponent: (c: unknown) => c,
  },
  measure: vi.fn(),
  runOnJS: (fn: unknown) => fn,
  useAnimatedRef: () => ({ current: null }),
  useAnimatedStyle: () => ({}),
  useSharedValue: (v: unknown) => ({ value: v }),
  withSequence: vi.fn(),
  withTiming: vi.fn(),
}));
vi.mock("@/hooks/useTheme", () => ({ useTheme: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));

import {
  dueColorFor,
  formatDueWithBucket,
  priorityStripeColor,
} from "@/components/board/TaskCard";

type ThemeColors = Parameters<typeof priorityStripeColor>[1];

const colors = {
  destructive: "#dc2626",
  heat: "#f97316",
  mutedForeground: "#6b7280",
  primary: "#2563eb",
} as unknown as ThemeColors;

const t = (key: string) => key;

describe("priorityStripeColor", () => {
  it("maps urgent to destructive and high to heat", () => {
    expect(priorityStripeColor("urgent", colors)).toBe("#dc2626");
    expect(priorityStripeColor("high", colors)).toBe("#f97316");
  });

  it("maps low to mutedForeground and normal to transparent", () => {
    expect(priorityStripeColor("low", colors)).toBe("#6b7280");
    expect(priorityStripeColor("normal", colors)).toBe("transparent");
  });
});

describe("dueColorFor", () => {
  it("maps overdue/soon/later buckets onto theme tokens", () => {
    expect(dueColorFor("overdue", colors)).toBe("#dc2626");
    expect(dueColorFor("soon", colors)).toBe("#2563eb");
    expect(dueColorFor("later", colors)).toBe("#6b7280");
    expect(dueColorFor(null, colors)).toBe("#6b7280");
  });
});

describe("formatDueWithBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fixed instant so the "tomorrow" branch is deterministic regardless of the
    // machine's timezone (this repo's dev machines run Europe/Berlin, CI runs UTC).
    vi.setSystemTime(new Date("2026-07-26T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns bucket labels for overdue and today", () => {
    expect(formatDueWithBucket("2026-07-20T00:00:00.000Z", "overdue", t)).toBe(
      "board.task.dueOverdue",
    );
    expect(formatDueWithBucket("2026-07-26T00:00:00.000Z", "today", t)).toBe(
      "board.task.dueToday",
    );
  });

  it("distinguishes tomorrow from the rest of the soon bucket", () => {
    expect(formatDueWithBucket("2026-07-27T09:00:00.000Z", "soon", t)).toBe(
      "board.task.dueTomorrow",
    );
    expect(formatDueWithBucket("2026-07-29T09:00:00.000Z", "soon", t)).not.toBe(
      "board.task.dueTomorrow",
    );
  });
});
