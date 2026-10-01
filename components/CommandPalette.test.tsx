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
});
