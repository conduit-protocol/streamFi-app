import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import React, { act } from 'react';
import { createRoot } from "react-dom/client";

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

  afterEach(() => {
    vi.restoreAllMocks();
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
    cleanup(root, container);
  });

  it("renders reset button", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Reset to Defaults");
    cleanup(root, container);
  });

  it("does not rewrite loaded settings on initial mount (#422)", () => {
    localStorage.setItem("conduit:settings", JSON.stringify({ network: "testnet" }));
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const { root, container } = renderSettings();

    expect(setItemSpy).not.toHaveBeenCalled();
    cleanup(root, container);
  });

  it("does not crash when persisting settings throws (#422)", () => {
    const { container, root } = renderSettings();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    const toggle = Array.from(container.querySelectorAll("input")).find(
      (input) => input.getAttribute("type") === "checkbox",
    );

    expect(() => {
      act(() => {
        toggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }).not.toThrow();

    expect(container.textContent).toContain("Settings");
    cleanup(root, container);
  });

  it("renders timestamp format toggle (#556)", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Timestamp Format");
    expect(container.textContent).toMatch(/Relative|Absolute/);
    cleanup(root, container);
  });

  it("renders auto-refresh interval selector (#572)", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Auto-Refresh Interval");
    cleanup(root, container);
  });

  it("renders notification channels (Email, Telegram, Browser Push) and preferences matrix (#786)", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Notification Channels");
    expect(container.textContent).toContain("Browser Push");
    expect(container.textContent).toContain("Email");
    expect(container.textContent).toContain("Telegram");

    expect(container.textContent).toContain("Notification Preferences Matrix");
    expect(container.textContent).toContain("Stream Cancelled");
    expect(container.textContent).toContain("Cliff Reached");
    expect(container.textContent).toContain("Stream Completed");
    expect(container.textContent).toContain("Funds Withdrawn");

    const matrix = container.querySelector('[data-testid="notification-matrix"]');
    expect(matrix).not.toBeNull();

    const pushToggle = container.querySelector('[data-testid="channel-toggle-browserPush"]');
    const emailToggle = container.querySelector('[data-testid="channel-toggle-email"]');
    const telegramToggle = container.querySelector('[data-testid="channel-toggle-telegram"]');
    expect(pushToggle).not.toBeNull();
    expect(emailToggle).not.toBeNull();
    expect(telegramToggle).not.toBeNull();

    cleanup(root, container);
  });

  it("toggles notification channels and updates matrix cells (#786)", () => {
    const { container, root } = renderSettings();
    const telegramToggle = container.querySelector('[data-testid="channel-toggle-telegram"]') as HTMLInputElement | null;
    expect(telegramToggle).not.toBeNull();

    act(() => {
      telegramToggle!.click();
    });

    const matrixCell = container.querySelector('[data-testid="matrix-streamCancel-telegram"]') as HTMLInputElement | null;
    expect(matrixCell).not.toBeNull();

    cleanup(root, container);
  });

  it("renders Developer Mode toggle and reveals raw storage keys and XDR preview (#787)", () => {
    const { container, root } = renderSettings();
    expect(container.textContent).toContain("Developer Mode");
    expect(container.textContent).toContain("Developer Inspection Mode");

    const devToggle = container.querySelector('[data-testid="developer-mode-toggle"]') as HTMLInputElement | null;
    expect(devToggle).not.toBeNull();
    expect(devToggle?.checked).toBe(false);

    // Toggle Developer Mode on
    act(() => {
      devToggle!.click();
    });

    expect(devToggle?.checked).toBe(true);
    expect(container.textContent).toContain("Developer Mode: Raw Contract Data & XDR");
    expect(container.textContent).toContain("Raw Contract Storage Key (LedgerKey XDR)");
    expect(container.textContent).toContain("Raw Invocation XDR");

    const storageKeyEl = container.querySelector('[data-testid="raw-storage-key-xdr"]');
    expect(storageKeyEl).not.toBeNull();

    const invocationXdrEl = container.querySelector('[data-testid="raw-invocation-xdr"]');
    expect(invocationXdrEl).not.toBeNull();

    cleanup(root, container);
  });
});
