import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from 'react';
import { createRoot } from "react-dom/client";

// ── Mutable wallet state (changed per test) ──────────────────────────────────

let currentPublicKey: string | null = "GTESTKEY1234567890ABCDEF";

vi.mock("@/contexts/WalletContext", () => ({
  useWallet: () => ({
    publicKey: currentPublicKey,
    connected: currentPublicKey !== null,
  }),
}));

// ── next/navigation (URL sync for tab/status/token/sort, #548) ──────────────

const mockRouterReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  usePathname: () => "/streams",
  useSearchParams: () => currentSearchParams,
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
    currentSearchParams = new URLSearchParams();
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

describe("StreamsPage — multi-select for comparison", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    currentPublicKey = "GTESTKEY1234567890ABCDEF";
    currentSearchParams = new URLSearchParams();
    const stream = await import("@/lib/stream");
    vi.mocked(stream.getStreamAddress).mockImplementation(async (_pk, id) => `CADDR${id}`);
    vi.mocked(stream.getStreamInfo).mockResolvedValue({
      sender: "GSENDER",
      recipient: "GTESTKEY1234567890ABCDEF",
      token: "CTOKEN",
      ratePerSecond: 1n,
      startTime: 0,
      endTime: 0,
      withdrawn: 0n,
      paused: false,
      pausedAt: 0,
      clawbackEnabled: false,
      cancelled: false,
      operator: null,
    });
    mockStreamsByRecipient.mockResolvedValue([1n, 2n, 3n, 4n, 5n]);
    mockStreamsBySender.mockResolvedValue([]);
  });

  async function load() {
    const r = renderStreamsPage();
    await act(async () => {
      await new Promise((res) => setTimeout(res, 20));
    });
    return r;
  }

  const boxes = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

  it("links to the compare view once two streams are selected", async () => {
    const { container, root } = await load();
    expect(boxes(container)).toHaveLength(5);
    expect(container.querySelector('a[href^="/streams/compare"]')).toBeNull();

    act(() => boxes(container)[0]!.click());
    expect(container.textContent).toContain("pick at least 2");
    expect(container.querySelector('a[href^="/streams/compare"]')).toBeNull();

    act(() => boxes(container)[2]!.click());
    const link = container.querySelector('a[href^="/streams/compare"]');
    expect(link?.getAttribute("href")).toBe("/streams/compare?ids=1,3");
    cleanup(root, container);
  });

  it("disables further checkboxes at the selection limit", async () => {
    const { container, root } = await load();
    for (const i of [0, 1, 2, 3]) act(() => boxes(container)[i]!.click());
    expect(boxes(container)[4]!.disabled).toBe(true);
    expect(container.querySelector('a[href^="/streams/compare"]')?.getAttribute("href"))
      .toBe("/streams/compare?ids=1,2,3,4");
    cleanup(root, container);
  });

  it("clears the selection when switching tabs", async () => {
    const { container, root } = await load();
    act(() => boxes(container)[0]!.click());
    expect(container.textContent).toContain("1 selected");
    const sendingTab = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Sending",
    )!;
    act(() => sendingTab.click());
    expect(container.textContent).not.toContain("selected");
    cleanup(root, container);
  });
});
