/**
 * Global test setup for @dragons/web.
 *
 * Configures fake timer defaults so vi.useFakeTimers() calls in beforeEach
 * blocks only fake the timer primitives needed for debounce testing, leaving
 * React 19 / Radix UI scheduler APIs intact.
 */
import { vi } from "vitest";

vi.setConfig({
  fakeTimers: {
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "Date",
    ],
  },
});
