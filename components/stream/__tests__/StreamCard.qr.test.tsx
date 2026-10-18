import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", props, children),
}));

vi.mock("@/lib/stream-notes-storage", () => ({
  getStreamNote: vi.fn(() => null),
}));

import { StreamCard } from "../StreamCard";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
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

const BASE_PROPS = {
  id: "1",
  counterparty: "GCOUNTERPARTY1234567890",
  role: "recipient" as const,
  token: "CTOKEN1234567890",
  ratePerSecond: 1_000_000n,
  startTime: Math.floor(Date.now() / 1000) - 100,
  endTime: Math.floor(Date.now() / 1000) + 100,
  status: "active" as const,
};

describe("StreamCard — token address QR code (#550)", () => {
  it("shows a QR-code trigger next to the token address", () => {
    act(() => {
      root.render(React.createElement(StreamCard, BASE_PROPS));
    });
    expect(container.querySelector('[aria-label="Show QR code"]')).not.toBeNull();
  });

  it("opens the QR modal for the token address without navigating the card link", async () => {
    act(() => {
      root.render(React.createElement(StreamCard, BASE_PROPS));
    });
    const qrButton = container.querySelector('[aria-label="Show QR code"]') as HTMLButtonElement;

    await act(async () => {
      qrButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain(BASE_PROPS.token);
  });
});
