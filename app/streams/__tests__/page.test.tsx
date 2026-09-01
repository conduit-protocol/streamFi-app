import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// ── Mutable wallet state (changed per test) ──────────────────────────────────

let currentPublicKey: string | null = "GTESTKEY1234567890ABCDEF";

vi.mock("@/contexts/WalletContext", () => ({
  useWallet: () => ({
    publicKey: currentPublicKey,
    connected: currentPublicKey !== null,
  }),
}));

// ── Mock factory / stream functions ──────────────────────────────────────────

const mockStreamsBySender = vi.fn();
const mockStreamsByRecipient = vi.fn();

vi.mock("@/lib/factory", () => ({
  streamsBySender: (...args: unknown[]) => mockStreamsBySender(...args),
  streamsByRecipient: (...args: unknown[]) => mockStreamsByRecipient(...args),
}));

vi.mock("@/lib/stream", () => ({
  getStreamAddress: vi.fn(),
  getStreamInfo: vi.fn(),
}));

vi.mock("@/components/stream/StreamCard", () => ({
  StreamCard: () => React.createElement("div", { "data-testid": "stream-card" }),
}));

vi.mock("@/components/stream/StreamCardSkeleton", () => ({
  StreamCardSkeleton: () => React.createElement("div", { "data-testid": "skeleton" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", props, children),
}));

vi.mock("lucide-react");

// ── Import after mocks ───────────────────────────────────────────────────────

import StreamsPage from "../page";

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderStreamsPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(StreamsPage));
  });
  return { container, root };
}

function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

// ── Tests ────────────────────────────────────────────────────────────────────
// Regression coverage for #89: a malformed RPC payload (e.g. streamsBySender
// rejecting with a boundary-check error from the factory/soroban decoders)
// used to be silently swallowed to console.error, leaving the user looking at
// a misleading "no streams" empty state with no indication anything failed.

describe("StreamsPage — RPC deserialization failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPublicKey = "GTESTKEY1234567890ABCDEF";
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([]);
  });

  it("surfaces a malformed-payload rejection as a visible error, not a silent empty state", async () => {
    mockStreamsBySender.mockRejectedValue(
      new Error("Malformed RPC payload: expected a vec, got scvVoid"),
    );
    mockStreamsByRecipient.mockRejectedValue(
      new Error("Malformed RPC payload: expected a vec, got scvVoid"),
    );

    const { container, root } = renderStreamsPage();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(container.textContent).toContain("Malformed RPC payload");
    cleanup(root, container);
  });

  it("clears the error banner when a subsequent load succeeds", async () => {
    mockStreamsBySender.mockRejectedValueOnce(new Error("Malformed RPC payload"));
    mockStreamsByRecipient.mockRejectedValueOnce(new Error("Malformed RPC payload"));

    const { container, root } = renderStreamsPage();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(container.textContent).toContain("Malformed RPC payload");

    // Reconnect with a wallet whose load succeeds
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([]);
    currentPublicKey = "GDIFFERENTKEY999";
    act(() => {
      root.render(React.createElement(StreamsPage));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(container.textContent).not.toContain("Malformed RPC payload");
    cleanup(root, container);
  });

  it("clears the error banner when the wallet disconnects", async () => {
    mockStreamsBySender.mockRejectedValue(new Error("Malformed RPC payload"));
    mockStreamsByRecipient.mockRejectedValue(new Error("Malformed RPC payload"));

    const { container, root } = renderStreamsPage();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(container.textContent).toContain("Malformed RPC payload");

    currentPublicKey = null;
    act(() => {
      root.render(React.createElement(StreamsPage));
    });

    expect(container.textContent).not.toContain("Malformed RPC payload");
    cleanup(root, container);
  });

  it("renders normally with no error banner on a clean load", async () => {
    const { container, root } = renderStreamsPage();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(container.querySelector('[role="alert"]')).toBeNull();
    cleanup(root, container);
  });
});
