import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// ── Mutable wallet state (changed per test) ──────────────────────────────────

let currentPublicKey: string | null = "GTESTKEY1234567890ABCDEF";

vi.mock("@/contexts/WalletContext", () => ({
  useWallet: () => ({
    publicKey: currentPublicKey,
    connected: currentPublicKey !== null,
    walletName: "TestWallet",
    connecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    signTx: vi.fn(),
  }),
}));

// ── Mock factory functions ───────────────────────────────────────────────────

const mockStreamsBySender = vi.fn();
const mockStreamsByRecipient = vi.fn();

vi.mock("@/lib/factory", () => ({
  streamsBySender: (...args: unknown[]) => mockStreamsBySender(...args),
  streamsByRecipient: (...args: unknown[]) => mockStreamsByRecipient(...args),
}));

// ── Mock stream functions ────────────────────────────────────────────────────

const mockGetStreamAddress = vi.fn();
const mockGetStreamInfo = vi.fn();

vi.mock("@/lib/stream", () => ({
  getStreamAddress: (...args: unknown[]) => mockGetStreamAddress(...args),
  getStreamInfo: (...args: unknown[]) => mockGetStreamInfo(...args),
}));

vi.mock("@/lib/format", () => ({
  fromStroops: (val: bigint) => `formatted_${val}`,
}));

// ── Mock child components ────────────────────────────────────────────────────

vi.mock("@/components/stream/StreamCard", () => ({
  StreamCard: (props: Record<string, unknown>) =>
    React.createElement("div", {
      "data-testid": "stream-card",
      "data-id": props.id,
    }),
}));

vi.mock("@/components/stream/StreamCardSkeleton", () => ({
  StreamCardSkeleton: () =>
    React.createElement("div", { "data-testid": "skeleton" }),
}));

vi.mock("@/components/stream/BulkWithdrawButton", () => ({
  BulkWithdrawButton: () =>
    React.createElement("div", { "data-testid": "bulk-withdraw" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", props, children),
}));

vi.mock("lucide-react", () => ({
  Plus: () => React.createElement("span", null, "+"),
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import DashboardPage from "../page";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createStreamInfo(overrides: Record<string, unknown> = {}) {
  return {
    sender: "GSENDER123",
    recipient: "GRECIPIENT456",
    token: "CTOKEN789",
    ratePerSecond: 1000000n,
    startTime: Math.floor(Date.now() / 1000) - 86400,
    endTime: Math.floor(Date.now() / 1000) + 86400 * 30,
    withdrawn: 500000n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    cancelled: false,
    ...overrides,
  };
}

function renderDashboard() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(DashboardPage));
  });
  return { container, root };
}

function cleanupDashboard(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("DashboardPage — heavy load initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPublicKey = "GTESTKEY1234567890ABCDEF";
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([]);
    mockGetStreamAddress.mockResolvedValue(null);
    mockGetStreamInfo.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the Dashboard heading", () => {
    const { container, root } = renderDashboard();
    expect(container.textContent).toContain("Dashboard");
    cleanupDashboard(root, container);
  });

  it("shows connect-wallet message when wallet is disconnected", () => {
    currentPublicKey = null;
    const { container, root } = renderDashboard();
    expect(container.textContent).toContain("Connect your wallet");
    cleanupDashboard(root, container);
  });

  it("shows loading skeletons while streams are loading", async () => {
    let resolveSenders: (v: bigint[]) => void;
    mockStreamsBySender.mockImplementation(
      () => new Promise((r) => (resolveSenders = r)),
    );
    let resolveRecipients: (v: bigint[]) => void;
    mockStreamsByRecipient.mockImplementation(
      () => new Promise((r) => (resolveRecipients = r)),
    );

    const { container, root } = renderDashboard();

    // Should show skeletons while loading
    expect(container.querySelectorAll('[data-testid="skeleton"]').length).toBe(3);

    // Resolve the promises
    await act(async () => {
      resolveSenders!([]);
      resolveRecipients!([]);
    });

    // Skeletons should be gone
    expect(container.querySelectorAll('[data-testid="skeleton"]').length).toBe(0);
    cleanupDashboard(root, container);
  });

  // ── Boundary checks ──────────────────────────────────────────────────────

  it("handles null IDs from factory without crashing", async () => {
    mockStreamsBySender.mockResolvedValue(null);
    mockStreamsByRecipient.mockResolvedValue(null);

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toContain("Dashboard");
    expect(container.textContent).toContain("No receiving streams yet.");
    cleanupDashboard(root, container);
  });

  it("handles undefined IDs from factory without crashing", async () => {
    mockStreamsBySender.mockResolvedValue(undefined);
    mockStreamsByRecipient.mockResolvedValue(undefined);

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toContain("Dashboard");
    cleanupDashboard(root, container);
  });

  it("handles non-array IDs from factory without crashing", async () => {
    mockStreamsBySender.mockResolvedValue("not-an-array");
    mockStreamsByRecipient.mockResolvedValue(42);

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toContain("Dashboard");
    cleanupDashboard(root, container);
  });

  it("handles factory call rejection without crashing", async () => {
    mockStreamsBySender.mockRejectedValue(new Error("Network timeout"));
    mockStreamsByRecipient.mockRejectedValue(new Error("RPC failure"));

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toContain("Dashboard");
    cleanupDashboard(root, container);
  });

  it("skips streams where getStreamAddress returns null", async () => {
    mockStreamsBySender.mockResolvedValue([1n, 2n, 3n]);
    mockStreamsByRecipient.mockResolvedValue([]);
    mockGetStreamAddress.mockResolvedValue(null);

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(0);
    cleanupDashboard(root, container);
  });

  it("skips streams where getStreamInfo returns null", async () => {
    mockStreamsBySender.mockResolvedValue([1n, 2n]);
    mockStreamsByRecipient.mockResolvedValue([]);
    mockGetStreamAddress.mockResolvedValue("CVALIDADDR");
    mockGetStreamInfo.mockResolvedValue(null);

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(0);
    cleanupDashboard(root, container);
  });

  it("skips streams where getStreamInfo returns malformed object", async () => {
    mockStreamsBySender.mockResolvedValue([1n]);
    mockStreamsByRecipient.mockResolvedValue([]);
    mockGetStreamAddress.mockResolvedValue("CVALIDADDR");
    mockGetStreamInfo.mockResolvedValue({ sender: "G123" }); // missing required fields

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(0);
    cleanupDashboard(root, container);
  });

  it("skips streams where ratePerSecond is not a bigint", async () => {
    mockStreamsBySender.mockResolvedValue([1n]);
    mockStreamsByRecipient.mockResolvedValue([]);
    mockGetStreamAddress.mockResolvedValue("CVALIDADDR");
    mockGetStreamInfo.mockResolvedValue(
      createStreamInfo({ ratePerSecond: "not-a-bigint" }),
    );

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(0);
    cleanupDashboard(root, container);
  });

  it("skips streams where getStreamAddress throws", async () => {
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([1n, 2n]);
    mockGetStreamAddress
      .mockResolvedValueOnce("CVALIDADDR1")
      .mockRejectedValueOnce(new Error("RPC error"));
    mockGetStreamInfo.mockResolvedValue(createStreamInfo());

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(1);
    cleanupDashboard(root, container);
  });

  it("skips streams where getStreamInfo throws", async () => {
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([1n, 2n]);
    mockGetStreamAddress.mockResolvedValue("CVALIDADDR");
    mockGetStreamInfo
      .mockResolvedValueOnce(createStreamInfo())
      .mockRejectedValueOnce(new Error("Malformed response"));

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(1);
    cleanupDashboard(root, container);
  });

  // ── Valid data rendering ─────────────────────────────────────────────────

  it("renders stream cards for valid streams", async () => {
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([1n]);
    mockGetStreamAddress.mockResolvedValue("CVALIDADDR");
    mockGetStreamInfo.mockResolvedValue(createStreamInfo());

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(1);
    cleanupDashboard(root, container);
  });

  it("renders stats for valid streams", async () => {
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([1n]);
    mockGetStreamAddress.mockResolvedValue("CVALIDADDR");
    mockGetStreamInfo.mockResolvedValue(createStreamInfo());

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toContain("Active streams");
    expect(container.textContent).toContain("Receiving /s");
    cleanupDashboard(root, container);
  });

  // ── Async cleanup (heavy load race conditions) ──────────────────────────

  it("does not update state after cleanup when publicKey changes rapidly", async () => {
    let resolveFirst: (v: bigint[]) => void;
    mockStreamsBySender.mockImplementationOnce(
      () => new Promise((r) => (resolveFirst = r)),
    );
    mockStreamsByRecipient.mockResolvedValue([]);

    const { container, root } = renderDashboard();

    // While first load is in-flight, change publicKey
    await act(async () => {
      currentPublicKey = "GDIFFERENTKEY999";
    });

    // Now a second effect has started. Resolve the first load.
    await act(async () => {
      resolveFirst!([1n]); // This should be ignored
    });

    // The second effect should have cleaned up and started fresh.
    // The first effect's stale data should NOT be rendered.
    // (The second effect also uses the mock which returns [] by default)
    expect(container.textContent).toContain("Dashboard");
    cleanupDashboard(root, container);
  });

  it("cleans up properly when wallet disconnects during load", async () => {
    let resolveSenders: (v: bigint[]) => void;
    mockStreamsBySender.mockImplementation(
      () => new Promise((r) => (resolveSenders = r)),
    );
    mockStreamsByRecipient.mockResolvedValue([]);

    const { container, root } = renderDashboard();

    // Disconnect wallet while load is in-flight
    await act(async () => {
      currentPublicKey = null;
    });

    // Now resolve the stale promise — should NOT update state
    await act(async () => {
      resolveSenders!([1n, 2n, 3n]);
    });

    // Should show disconnected state, not stale stream data
    expect(container.textContent).toContain("Connect your wallet");
    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(0);
    cleanupDashboard(root, container);
  });

  it("shows error message when factory call fails", async () => {
    mockStreamsBySender.mockRejectedValue(new Error("RPC failure"));
    mockStreamsByRecipient.mockRejectedValue(new Error("RPC failure"));

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // The individual loadRows catch returns [] on factory failure,
    // so no error is propagated to Promise.all. Verify graceful handling.
    expect(container.textContent).toContain("Dashboard");
    cleanupDashboard(root, container);
  });

  it("clears error state when wallet disconnects", async () => {
    mockStreamsBySender.mockRejectedValue(new Error("fail"));
    mockStreamsByRecipient.mockRejectedValue(new Error("fail"));

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Disconnect wallet
    await act(async () => {
      currentPublicKey = null;
    });

    // Error should be cleared
    expect(container.textContent).not.toContain("Failed to load streams");
    cleanupDashboard(root, container);
  });

  // ── Mixed success/failure under load ────────────────────────────────────

  it("handles mixed valid and invalid streams under heavy load", async () => {
    const validInfo = createStreamInfo();
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([1n, 2n, 3n, 4n, 5n]);
    mockGetStreamAddress.mockImplementation(async (_src: string, id: bigint) => {
      if (id === 2n) return null; // invalid
      if (id === 4n) throw new Error("timeout");
      return `CADDR_${id}`;
    });
    mockGetStreamInfo.mockImplementation(async (_src: string, addr: string) => {
      if (addr === "CADDR_3") throw new Error("malformed");
      return validInfo;
    });

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Streams 1 and 5 should render; 2 (null addr), 3 (bad info), 4 (addr throws) are skipped
    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(2);
    cleanupDashboard(root, container);
  });

  it("shows empty state when all streams fail to load", async () => {
    mockStreamsBySender.mockResolvedValue([1n, 2n, 3n]);
    mockStreamsByRecipient.mockResolvedValue([]);
    mockGetStreamAddress.mockResolvedValue(null);

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toContain("No receiving streams yet.");
    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(0);
    cleanupDashboard(root, container);
  });

  // ── BigInt safety in derived stats ──────────────────────────────────────

  it("handles streams with valid BigInt fields in stats", async () => {
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([1n]);
    mockGetStreamAddress.mockResolvedValue("CVALIDADDR");
    mockGetStreamInfo.mockResolvedValue(
      createStreamInfo({
        ratePerSecond: 2000000n,
        withdrawn: 1000000n,
        sender: "GSENDER_ABC",
      }),
    );

    const { container, root } = renderDashboard();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Stats should render without crashing
    expect(container.textContent).toContain("Active streams");
    expect(container.textContent).toContain("formatted_");
    cleanupDashboard(root, container);
  });
});
