import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { CommandPalette } from "./CommandPalette";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("lucide-react", () => ({
  Search: () => React.createElement("svg", { "data-testid": "search-icon" }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
});

function render() {
  act(() => {
    root.render(React.createElement(CommandPalette));
  });
}

function fireKey(target: EventTarget, init: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

describe("CommandPalette", () => {
  it("renders nothing until opened", () => {
    render();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("opens on Ctrl+K and closes on Escape", () => {
    render();
    fireKey(document, { key: "k", ctrlKey: true });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const input = container.querySelector("input")!;
    fireKey(input, { key: "Escape" });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("opens on Cmd+K (metaKey) too", () => {
    render();
    fireKey(document, { key: "k", metaKey: true });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("lists the static nav destinations by default", () => {
    render();
    fireKey(document, { key: "k", ctrlKey: true });
    const options = container.querySelectorAll('[role="option"]');
    const labels = Array.from(options).map((o) => o.textContent);
    expect(labels).toEqual(["Dashboard", "Streams", "Create stream", "Settings", "Profile"]);
  });

  it("filters destinations as the user types", () => {
    render();
    fireKey(document, { key: "k", ctrlKey: true });
    const input = container.querySelector("input")!;
    act(() => {
      Object.defineProperty(input, "value", { value: "streams", writable: true });
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const labels = Array.from(container.querySelectorAll('[role="option"]')).map((o) => o.textContent);
    expect(labels).toEqual(["Streams"]);
  });

  it("offers a 'Go to stream #N' entry for numeric queries", () => {
    render();
    fireKey(document, { key: "k", ctrlKey: true });
    const input = container.querySelector("input")!;
    act(() => {
      Object.defineProperty(input, "value", { value: "42", writable: true });
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const labels = Array.from(container.querySelectorAll('[role="option"]')).map((o) => o.textContent);
    expect(labels[0]).toBe("Go to stream #42");
  });

  it("navigates and closes on Enter", () => {
    render();
    fireKey(document, { key: "k", ctrlKey: true });
    const input = container.querySelector("input")!;
    fireKey(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("moves the active selection with arrow keys before selecting", () => {
    render();
    fireKey(document, { key: "k", ctrlKey: true });
    const input = container.querySelector("input")!;
    fireKey(input, { key: "ArrowDown" });
    fireKey(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/streams");
  });

  it("navigates on click", () => {
    render();
    fireKey(document, { key: "k", ctrlKey: true });
    const options = container.querySelectorAll('[role="option"]');
    act(() => {
      (options[2] as HTMLElement).click();
    });
    expect(mockPush).toHaveBeenCalledWith("/create");
  });

  it("closes when clicking the backdrop", () => {
    render();
    fireKey(document, { key: "k", ctrlKey: true });
    const overlay = container.firstElementChild as HTMLElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  describe("navigation shortcuts (g+d, g+c, g+s, g+p)", () => {
    it("navigates to Dashboard with g+d", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "g" });
        fireKey(document, { key: "d" });
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      } finally {
        vi.useRealTimers();
      }
    });

    it("navigates to Create with g+c", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "g" });
        fireKey(document, { key: "c" });
        expect(mockPush).toHaveBeenCalledWith("/create");
      } finally {
        vi.useRealTimers();
      }
    });

    it("navigates to Streams with g+s", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "g" });
        fireKey(document, { key: "s" });
        expect(mockPush).toHaveBeenCalledWith("/streams");
      } finally {
        vi.useRealTimers();
      }
    });

    it("navigates to Profile with g+p", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "g" });
        fireKey(document, { key: "p" });
        expect(mockPush).toHaveBeenCalledWith("/profile");
      } finally {
        vi.useRealTimers();
      }
    });

    it("handles uppercase g+D shortcuts", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "G" });
        fireKey(document, { key: "D" });
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not trigger shortcut if g key timeout expires", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "g" });
        // Fast forward 1100ms to exceed the 1 second timeout
        act(() => {
          vi.advanceTimersByTime(1100);
        });
        fireKey(document, { key: "d" });
        expect(mockPush).not.toHaveBeenCalledWith("/dashboard");
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not trigger shortcut if Ctrl is held with g+d", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "g" });
        fireKey(document, { key: "d", ctrlKey: true });
        // Should not navigate because Ctrl is held
        expect(mockPush).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not trigger shortcut if Meta is held with g+s", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "g" });
        fireKey(document, { key: "s", metaKey: true });
        // Should not navigate because Meta is held
        expect(mockPush).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("allows re-pressing g after a successful shortcut", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "g" });
        fireKey(document, { key: "d" });
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
        mockPush.mockClear();

        // Should be able to trigger another shortcut
        fireKey(document, { key: "g" });
        fireKey(document, { key: "s" });
        expect(mockPush).toHaveBeenCalledWith("/streams");
      } finally {
        vi.useRealTimers();
      }
    });

    it("ignores invalid keys after g press", () => {
      vi.useFakeTimers();
      try {
        render();
        fireKey(document, { key: "g" });
        fireKey(document, { key: "x" }); // Invalid key
        expect(mockPush).not.toHaveBeenCalled();
        // g state should still be active within the timeout
        fireKey(document, { key: "d" });
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not interfere with Cmd/Ctrl+K palette toggle", () => {
      vi.useFakeTimers();
      try {
        render();
        // Open palette with Ctrl+K
        fireKey(document, { key: "k", ctrlKey: true });
        expect(container.querySelector('[role="dialog"]')).not.toBeNull();

        // Pressing g should not trigger shortcuts while palette is open
        fireKey(document, { key: "g" });
        fireKey(document, { key: "d" });
        expect(mockPush).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
