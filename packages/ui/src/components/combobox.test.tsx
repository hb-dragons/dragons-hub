// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  vi,
  type MockedFunction,
} from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import * as React from "react";

import { Combobox, type ComboboxOption } from "./combobox";

// Fake timers drive the debounce. Never pair these with waitFor — waitFor only
// pumps jest fake timers, so its polling loop would never advance under vitest
// and the test would hang to the suite timeout. Advance inside act() instead.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const OPTIONS: ComboboxOption[] = [
  { value: "1", label: "Dragons U18", description: "Bezirksliga" },
  { value: "2", label: "Dragons U16" },
];

/** Runs the debounce timer plus the microtasks the async search resolves on. */
async function settleDebounce(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * The Popover is `modal`, so once the result list opens Radix marks everything
 * outside it aria-hidden and the input drops out of the accessibility tree.
 * Address it by slot instead of by role so the same helper works open or shut.
 */
function getInput() {
  const input = document.querySelector<HTMLInputElement>(
    '[data-slot="popover-anchor"]',
  );
  if (!input) throw new Error("combobox input not rendered");
  return input;
}

function type(value: string) {
  fireEvent.change(getInput(), { target: { value } });
}

let onSearch: MockedFunction<(q: string) => Promise<ComboboxOption[]>>;
let onSelect: MockedFunction<(o: ComboboxOption) => void>;

beforeEach(() => {
  onSearch = vi.fn(async () => OPTIONS);
  onSelect = vi.fn();
});

describe("Combobox search debounce", () => {
  it("does not search before the debounce elapses", () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("searches once the debounce elapses", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();
    expect(onSearch).toHaveBeenCalledExactlyOnceWith("Dragons");
  });

  it("collapses a burst of keystrokes into one search for the final query", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dr");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    type("Dra");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    type("Drag");
    await settleDebounce();

    expect(onSearch).toHaveBeenCalledExactlyOnceWith("Drag");
  });

  it("honours a custom debounce window", async () => {
    render(
      <Combobox onSearch={onSearch} onSelect={onSelect} debounceMs={800} />,
    );
    type("Dragons");
    await settleDebounce(300);
    expect(onSearch).not.toHaveBeenCalled();
    await settleDebounce(500);
    expect(onSearch).toHaveBeenCalledOnce();
  });
});

describe("Combobox minimum query length", () => {
  it("does not search a single character", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("D");
    await settleDebounce();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("searches at two characters", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dr");
    await settleDebounce();
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("closes the list again when the query is cut back below the minimum", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();
    expect(screen.getByText("Dragons U18")).toBeInTheDocument();

    type("D");
    await settleDebounce();
    expect(screen.queryByText("Dragons U18")).toBeNull();
  });
});

describe("Combobox result rendering", () => {
  it("lists each option's label and description", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();

    expect(screen.getByText("Dragons U18")).toBeInTheDocument();
    expect(screen.getByText("Bezirksliga")).toBeInTheDocument();
    expect(screen.getByText("Dragons U16")).toBeInTheDocument();
  });

  it("shows a searching hint while a refinement request is in flight", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();

    let resolve!: (value: ComboboxOption[]) => void;
    onSearch.mockImplementation(
      () => new Promise<ComboboxOption[]>((r) => (resolve = r)),
    );
    type("Dragons U");
    await settleDebounce();

    expect(screen.getByText("Searching...")).toBeInTheDocument();

    await act(async () => {
      resolve(OPTIONS);
    });
    expect(screen.queryByText("Searching...")).toBeNull();
  });

  it("stays closed during the very first search, so the hint is not visible yet", async () => {
    // setOpen(true) only runs after the first search resolves, and the hint
    // lives inside the popover. The first search therefore shows nothing at
    // all — the hint is a refinement-only affordance, not a first-load spinner.
    onSearch.mockImplementation(() => new Promise<ComboboxOption[]>(() => {}));
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();

    expect(onSearch).toHaveBeenCalledOnce();
    expect(screen.queryByText("Searching...")).toBeNull();
  });

  it("says so when a completed search returned nothing", async () => {
    onSearch.mockResolvedValue([]);
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();

    expect(screen.getByText("No results found")).toBeInTheDocument();
  });

  it("does not claim 'no results' before any search has completed", () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    expect(screen.queryByText("No results found")).toBeNull();
  });

  it("clears the list and stays quiet when the search rejects", async () => {
    onSearch.mockRejectedValue(new Error("network"));
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();

    expect(screen.queryByText("Dragons U18")).toBeNull();
    // hasSearched stays false on failure, so the user is not told there are no
    // results when what actually happened is that the request blew up.
    expect(screen.queryByText("No results found")).toBeNull();
    expect(screen.queryByText("Searching...")).toBeNull();
  });
});

describe("Combobox selection", () => {
  it("reports the chosen option and fills the input with its label", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();

    await act(async () => {
      fireEvent.click(screen.getByText("Dragons U16"));
    });

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(OPTIONS[1]);
    expect(getInput()).toHaveValue("Dragons U16");
  });

  it("closes the list after a selection", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();

    await act(async () => {
      fireEvent.click(screen.getByText("Dragons U16"));
    });

    expect(screen.queryByText("Dragons U18")).toBeNull();
  });

  it("does not re-search off the label it just wrote into the input", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();
    expect(onSearch).toHaveBeenCalledOnce();

    await act(async () => {
      fireEvent.click(screen.getByText("Dragons U16"));
    });
    await settleDebounce();

    // The label is >= 2 chars, so without the userTyping guard the effect would
    // fire a second search and reopen the list the user just dismissed.
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("returns focus to the input", async () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    type("Dragons");
    await settleDebounce();

    await act(async () => {
      fireEvent.click(screen.getByText("Dragons U16"));
    });

    expect(getInput()).toHaveFocus();
  });
});

describe("Combobox controlled value", () => {
  it("renders the value it is given instead of its own state", () => {
    render(
      <Combobox
        onSearch={onSearch}
        onSelect={onSelect}
        value="Dragons U18"
        onChange={vi.fn()}
      />,
    );
    expect(getInput()).toHaveValue("Dragons U18");
  });

  it("reports keystrokes through onChange and does not self-update", () => {
    const onChange = vi.fn();
    render(
      <Combobox
        onSearch={onSearch}
        onSelect={onSelect}
        value="Dra"
        onChange={onChange}
      />,
    );
    type("Drag");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Drag");
    expect(getInput()).toHaveValue("Dra");
  });

  it("does not search when the parent changes the value programmatically", async () => {
    const { rerender } = render(
      <Combobox
        onSearch={onSearch}
        onSelect={onSelect}
        value=""
        onChange={vi.fn()}
      />,
    );
    rerender(
      <Combobox
        onSearch={onSearch}
        onSelect={onSelect}
        value="Dragons U18"
        onChange={vi.fn()}
      />,
    );
    await settleDebounce();

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("reports the chosen label through onChange", async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [value, setValue] = React.useState("");
      return (
        <Combobox
          onSearch={onSearch}
          onSelect={onSelect}
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Controlled />);
    type("Dragons");
    await settleDebounce();

    await act(async () => {
      fireEvent.click(screen.getByText("Dragons U16"));
    });

    expect(onChange).toHaveBeenLastCalledWith("Dragons U16");
  });
});

describe("Combobox disabled", () => {
  it("disables the input", () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} disabled />);
    expect(getInput()).toBeDisabled();
  });

  it("keeps the list closed even when a search has results", async () => {
    const { rerender } = render(
      <Combobox onSearch={onSearch} onSelect={onSelect} />,
    );
    type("Dragons");
    await settleDebounce();
    expect(screen.getByText("Dragons U18")).toBeInTheDocument();

    rerender(<Combobox onSearch={onSearch} onSelect={onSelect} disabled />);
    expect(screen.queryByText("Dragons U18")).toBeNull();
  });
});

describe("Combobox labelling", () => {
  it("puts id, aria-describedby and aria-invalid on the inner input", () => {
    render(
      <>
        <label htmlFor="opponent">Gegner</label>
        <Combobox
          id="opponent"
          aria-describedby="opponent-error"
          aria-invalid
          onSearch={onSearch}
          onSelect={onSelect}
        />
      </>,
    );
    const input = screen.getByLabelText("Gegner");
    expect(input).toHaveAttribute("aria-describedby", "opponent-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the default placeholder", () => {
    render(<Combobox onSearch={onSearch} onSelect={onSelect} />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });
});
