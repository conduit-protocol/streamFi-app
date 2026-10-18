import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

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

const mockStreamsBySender = vi.fn();
const mockStreamsByRecipient = vi.fn();

vi.mock("@/lib/factory", () => ({
  streamsBySender: (...args: unknown[]) => mockStreamsBySender(...args),
  streamsByRecipient: (...args: unknown[]) => mockStreamsByRecipient(...args),
}));

const mockGetStreamAddress = vi.fn();
const mockGetStreamInfo = vi.fn();
const mockGetWithdrawable = vi.fn();

vi.mock("@/lib/stream", () => ({
  getStreamAddress: (...args: unknown[]) => mockGetStreamAddress(...args),
  getStreamInfo: (...args: unknown[]) => mockGetStreamInfo(...args),
  getWithdrawable: (...args: unknown[]) => mockGetWithdrawable(...args),
}));

vi.mock("@/lib/format", () => ({
  fromStroops: (val: bigint) => String(val),
}));

vi.mock("@/components/stream/StreamCard", () => ({
  StreamCard: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "stream-card", "data-id": props.id }),
}));

vi.mock("@/components/stream/StreamCardSkeleton", () => ({
  StreamCardSkeleton: () => React.createElement("div", { "data-testid": "skeleton" }),
}));

vi.mock("@/components/stream/BulkWithdrawButton", () => ({
  BulkWithdrawButton: () => React.createElement("div", { "data-testid": "bulk-withdraw" }),
}));

vi.mock("@/components/dashboard/EndingSoonWidget", () => ({
  EndingSoonWidget: () => null,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", props, children),
}));

vi.mock("lucide-react");

import DashboardPage from "../page";

const NOW = Math.floor(Date.now() / 1000);

function streamInfo(overrides: Record<string, unknown> = {}) {
  return {
    sender: "GSENDER123",
    recipient: "GRECIPIENT456",
    token: "CTOKEN789",
    ratePerSecond: 1_000_000n,
    startTime: NOW - 86_400,
    endTime: NOW + 86_400 * 30,
    withdrawn: 500_000n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    cancelled: false,
    ...overrides,
  };
}

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(DashboardPage));
  });
  return { container, root };
}

function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

async function load() {
  const r = render();
  await act(async () => {
    await new Promise((res) => setTimeout(res, 50));
  });
  return r;
}

describe("DashboardPage — date-range filter (#547)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPublicKey = "GTESTKEY1234567890ABCDEF";
    mockGetWithdrawable.mockResolvedValue(0n);
  });

  it("defaults to 'All time' and shows every stream", async () => {
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([1n, 2n]);
    mockGetStreamAddress.mockImplementation(async (_pk: string, id: bigint) => `CADDR${id}`);
    mockGetStreamInfo.mockImplementation(async (_pk: string, addr: string) =>
      addr === "CADDR1"
        ? streamInfo({ startTime: NOW - 86_400 * 400 }) // way outside any recent window
        : streamInfo({ startTime: NOW - 3_600 }),
    );

    const { container, root } = await load();
    const select = container.querySelector<HTMLSelectElement>("#dashboard-range")!;
    expect(select.value).toBe("all");
    expect(container.querySelectorAll('[data-testid="stream-card"]').length).toBe(2);
    cleanup(root, container);
  });

  it("filters out streams outside the selected preset range", async () => {
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([1n, 2n]);
    mockGetStreamAddress.mockImplementation(async (_pk: string, id: bigint) => `CADDR${id}`);
    mockGetStreamInfo.mockImplementation(async (_pk: string, addr: string) =>
      addr === "CADDR1"
        ? streamInfo({ startTime: NOW - 86_400 * 400, endTime: NOW - 86_400 * 399 })
        : streamInfo({ startTime: NOW - 3_600, endTime: NOW + 86_400 }),
    );

    const { container, root } = await load();
    const select = container.querySelector<HTMLSelectElement>("#dashboard-range")!;

    await act(async () => {
      select.value = "7d";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(1);
    expect(cards[0]!.getAttribute("data-id")).toBe("2");
    cleanup(root, container);
  });

  it("reveals custom start/end date inputs when 'Custom range' is selected", async () => {
    mockStreamsBySender.mockResolvedValue([]);
    mockStreamsByRecipient.mockResolvedValue([]);

    const { container, root } = await load();
    const select = container.querySelector<HTMLSelectElement>("#dashboard-range")!;
    expect(container.querySelector('input[aria-label="Range start"]')).toBeNull();

    await act(async () => {
      select.value = "custom";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.querySelector('input[aria-label="Range start"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Range end"]')).not.toBeNull();
    cleanup(root, container);
  });
});
