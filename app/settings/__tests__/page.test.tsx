import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

beforeAll(() => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", props, children),
}));

import SettingsPage from "../page";

function renderSettings() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(SettingsPage));
  });
  return { container, root };
}

function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
}

describe("SettingsPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the heading", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Settings");
    cleanup(root, container);
  });

  it("renders section headings", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Appearance");
    expect(container.textContent).toContain("Preferences");
    expect(container.textContent).toContain("General");
    cleanup(root, container);
  });

  it("renders theme buttons", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Light");
    expect(container.textContent).toContain("Dark");
    expect(container.textContent).toContain("System");
    cleanup(root, container);
  });

  it("renders slippage tolerance buttons", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("0.5%");
    expect(container.textContent).toContain("1%");
    expect(container.textContent).toContain("2%");
    expect(container.textContent).toContain("5%");
    cleanup(root, container);
  });

  it("renders toggles", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Enable Notifications");
    expect(container.textContent).toContain("Advanced Mode");
    cleanup(root, container);
  });

  it("renders reset button", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Reset to Defaults");
    cleanup(root, container);
  });
});
