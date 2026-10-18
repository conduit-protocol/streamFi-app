import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

let currentPublicKey: string | null = "GTESTKEY1234567890ABCDEF";

vi.mock("@/contexts/WalletContext", () => ({
  useWallet: () => ({
    publicKey: currentPublicKey,
    connected: currentPublicKey !== null,
  }),
}));

const mockRouterReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  usePathname: () => "/streams",
  useSearchParams: () => currentSearchParams,
}));

const mockStreamsBySender = vi.fn();
const mockStreamsByRecipient = vi.fn();

vi.mock("@/lib/factory", () => ({
  streamsBySender: (...args: unknown[]) => mockStreamsBySender(...args),
  streamsByRecipient: (...args: unknown[]) => mockStreamsByRecipient(...args),
}));

vi.mock("@/lib/stream", () => ({
  getStreamAddress: vi.fn(async (_pk: string, id: bigint) => `CADDR${id}`),
  getStreamInfo: vi.fn(),
}));

vi.mock("@/components/stream/StreamCard", () => ({
  StreamCard: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "stream-card", "data-id": props.id }),
}));

vi.mock("@/components/stream/StreamCardSkeleton", () => ({
  StreamCardSkeleton: () => React.createElement("div", { "data-testid": "skeleton" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", props, children),
}));

vi.mock("lucide-react");

import StreamsPage from "../page";
import { getStreamInfo } from "@/lib/stream";

const mockGetStreamInfo = vi.mocked(getStreamInfo);

function baseInfo(overrides: Record<string, unknown> = {}) {
  return {
    sender: "GSENDER",
    recipient: "GTESTKEY1234567890ABCDEF",
    token: "CTOKENAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ratePerSecond: 1_000_000n,
    startTime: 0,
    endTime: 0,
    withdrawn: 0n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    cancelled: false,
    operator: null,
    ...overrides,
  };
}

function render() {
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

async function load() {
  const r = render();
  await act(async () => {
    await new Promise((res) => setTimeout(res, 20));
  });
  return r;
}

describe("StreamsPage — sort, token filter, and URL sync (#548)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPublicKey = "GTESTKEY1234567890ABCDEF";
    currentSearchParams = new URLSearchParams();
    mockStreamsByRecipient.mockResolvedValue([1n, 2n, 3n]);
    mockStreamsBySender.mockResolvedValue([]);
    mockGetStreamInfo.mockImplementation(async (_pk: string, addr: string) => {
      if (addr === "CADDR1") return baseInfo({ ratePerSecond: 300n, endTime: 300 });
      if (addr === "CADDR2") return baseInfo({ ratePerSecond: 100n, endTime: 100 });
      return baseInfo({ ratePerSecond: 200n, endTime: 0 });
    });
  });

  it("sorts by amount ascending when the sort control changes", async () => {
    const { container, root } = await load();
    const sortSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Sort streams"]',
    )!;

    await act(async () => {
      sortSelect.value = "amount-asc";
      sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(Array.from(cards).map((c) => c.getAttribute("data-id"))).toEqual(["2", "3", "1"]);
    cleanup(root, container);
  });

  it("sorts by end date, with open-ended streams last when ascending", async () => {
    const { container, root } = await load();
    const sortSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Sort streams"]',
    )!;

    await act(async () => {
      sortSelect.value = "end-asc";
      sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(Array.from(cards).map((c) => c.getAttribute("data-id"))).toEqual(["2", "1", "3"]);
    cleanup(root, container);
  });

  it("seeds sort/status/token state from the URL on first render", async () => {
    currentSearchParams = new URLSearchParams("status=active&sort=amount-desc");
    const { container, root } = await load();

    const statusSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Filter by status"]',
    )!;
    const sortSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Sort streams"]',
    )!;
    expect(statusSelect.value).toBe("active");
    expect(sortSelect.value).toBe("amount-desc");
    cleanup(root, container);
  });

  it("writes filter/sort/tab state back to the URL via router.replace", async () => {
    const { container, root } = await load();
    const sortSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Sort streams"]',
    )!;

    await act(async () => {
      sortSelect.value = "amount-desc";
      sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const lastCall = mockRouterReplace.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain("sort=amount-desc");
    cleanup(root, container);
  });

  it("filters by token", async () => {
    mockGetStreamInfo.mockImplementation(async (_pk: string, addr: string) => {
      if (addr === "CADDR1") return baseInfo({ token: "CTOKENA_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
      return baseInfo({ token: "CTOKENB_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
    });
    const { container, root } = await load();

    const tokenSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Filter by token"]',
    )!;
    expect(tokenSelect.querySelectorAll("option").length).toBe(3); // ALL + 2 tokens

    await act(async () => {
      tokenSelect.value = "CTOKENA_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      tokenSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const cards = container.querySelectorAll('[data-testid="stream-card"]');
    expect(cards.length).toBe(1);
    expect(cards[0]!.getAttribute("data-id")).toBe("1");
    cleanup(root, container);
  });
});
