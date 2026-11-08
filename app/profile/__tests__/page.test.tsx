import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ProfilePage from "../page";

// ── Mutable wallet state (changed per test) ──────────────────────────────────

let walletState: {
  publicKey: string | null;
  connected: boolean;
  walletName: string | null;
  connecting: boolean;
} = {
  publicKey: null,
  connected: false,
  walletName: null,
  connecting: false,
};

export const mockDisconnect = vi.fn();

vi.mock("@/contexts/WalletContext", () => ({
  useWallet: () => ({
    publicKey: walletState.publicKey,
    connected: walletState.connected,
    walletName: walletState.walletName,
    connecting: walletState.connecting,
    connect: vi.fn(),
    disconnect: mockDisconnect,
    signTx: vi.fn(),
  }),
}));

vi.mock("@/components/ui/CopyHashButton", () => ({
  CopyHashButton: (props: { hash: string }) =>
    React.createElement("button", {
      "data-testid": "copy-hash-button",
      "data-hash": props.hash,
    }),
}));

vi.mock("next/link", () => ({
  default: (props: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href: props.href, className: props.className }, props.children),
}));

vi.mock("@/lib/stellar-address", () => ({
  isValidStellarPublicKey: () => true,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

let lastRoot: ReturnType<typeof createRoot> | null = null;
let lastContainer: HTMLElement | null = null;

function renderProfilePage(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  lastRoot = root;
  lastContainer = container;
  act(() => root.render(React.createElement(ProfilePage)));
  return container;
}

function cleanupProfilePage(): void {
  if (lastRoot) {
    act(() => lastRoot!.unmount());
    lastRoot = null;
  }
  if (lastContainer && lastContainer.parentNode) {
    lastContainer.parentNode.removeChild(lastContainer);
    lastContainer = null;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ProfilePage", () => {
  beforeEach(() => {
    cleanupProfilePage();
    walletState = {
      publicKey: null,
      connected: false,
      walletName: null,
      connecting: false,
    };
  });

  afterEach(() => {
    cleanupProfilePage();
  });

  it("renders loading skeleton while connecting", () => {
    walletState.connecting = true;
    const container = renderProfilePage();

    expect(container.textContent).not.toContain("Profile");
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("renders disconnected state with connect prompt", () => {
    walletState.connected = false;
    walletState.publicKey = null;
    const container = renderProfilePage();

    expect(container.textContent).toContain("Profile");
    expect(container.textContent).toContain("Connect your wallet to view your profile.");
    expect(container.querySelector('a[href="/"]')).not.toBeNull();
  });

  it("renders connected state with wallet details and quick links", () => {
    walletState.connected = true;
    walletState.publicKey = "GABCDE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF";
    walletState.walletName = "Freighter";
    const container = renderProfilePage();

    expect(container.textContent).toContain("Profile");
    expect(container.textContent).toContain("Wallet");
    expect(container.textContent).toContain("Provider");
    expect(container.textContent).toContain("Freighter");
    expect(container.textContent).toContain("Public Key");
    expect(container.textContent).toContain("GABCDE...CDEF");

    const copyBtn = container.querySelector('[data-testid="copy-hash-button"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.getAttribute("data-hash")).toBe(
      "GABCDE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF"
    );

    expect(container.querySelector('a[href="/dashboard"]')).not.toBeNull();
    expect(container.querySelector('a[href="/streams"]')).not.toBeNull();
    expect(container.querySelector('a[href="/transactions"]')).not.toBeNull();
  });

  it("falls back to disconnected when publicKey is null despite connected=true", () => {
    walletState.connected = true;
    walletState.publicKey = null;
    const container = renderProfilePage();

    expect(container.textContent).toContain("Connect your wallet to view your profile.");
  });

  it("shows Unknown when walletName is null", () => {
    walletState.connected = true;
    walletState.publicKey = "GABCDE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF";
    walletState.walletName = null;
    const container = renderProfilePage();

    expect(container.textContent).toContain("Unknown");
  });

  it("calls disconnect when Disconnect Wallet button is clicked", () => {
    walletState.connected = true;
    walletState.publicKey = "GABCDE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF";
    walletState.walletName = "Freighter";
    const container = renderProfilePage();

    const disconnectBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Disconnect Wallet")
    );
    expect(disconnectBtn).toBeDefined();

    act(() => {
      disconnectBtn!.click();
    });

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("toggles between shortened and full public key and links to Stellar Expert", () => {
    walletState.connected = true;
    const fullKey = "GABCDE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF";
    walletState.publicKey = fullKey;
    walletState.walletName = "Freighter";
    const container = renderProfilePage();

    // Initially displays shortened key and "Show full" button
    expect(container.textContent).toContain("GABCDE...CDEF");
    const toggleBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Show full")
    );
    expect(toggleBtn).toBeDefined();

    // Toggle to full key
    act(() => {
      toggleBtn!.click();
    });

    expect(container.textContent).toContain(fullKey);
    expect(container.textContent).toContain("Show shortened");

    // Toggle back to shortened key
    act(() => {
      toggleBtn!.click();
    });
    expect(container.textContent).toContain("GABCDE...CDEF");

    // Stellar Expert link check
    const explorerLink = container.querySelector(
      `a[href="https://stellar.expert/explorer/testnet/account/${fullKey}"]`
    ) as HTMLAnchorElement | null;
    expect(explorerLink).not.toBeNull();
    expect(explorerLink?.target).toBe("_blank");
    expect(explorerLink?.rel).toContain("noopener");
  });

  it("renders default blockie avatar and Upload Avatar button when connected (#784)", () => {
    walletState.connected = true;
    walletState.publicKey = "GABCDE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF";
    walletState.walletName = "Freighter";
    const container = renderProfilePage();

    expect(container.textContent).toContain("Profile Avatar");
    expect(container.textContent).toContain("Default Blockie");
    expect(container.textContent).toContain("Upload Avatar");

    const avatarImg = container.querySelector('[data-testid="profile-avatar-img"]') as HTMLImageElement | null;
    expect(avatarImg).not.toBeNull();
    expect(avatarImg?.src).toContain("data:image/svg+xml");
  });

  it("renders custom IPFS avatar and CID when metadata is present (#784)", () => {
    const pubKey = "GABCDE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF";
    localStorage.setItem(
      `conduit:profile-meta:${pubKey}`,
      JSON.stringify({
        publicKey: pubKey,
        avatarCid: "bafybeicmockipfsavatar1234567890",
        avatarUrl: "https://w3s.link/ipfs/bafybeicmockipfsavatar1234567890",
        updatedAt: Date.now(),
      })
    );

    walletState.connected = true;
    walletState.publicKey = pubKey;
    walletState.walletName = "Freighter";
    const container = renderProfilePage();

    expect(container.textContent).toContain("Custom IPFS Avatar");
    expect(container.textContent).toContain("bafybeicmockipfsavatar1234567890");
    expect(container.textContent).toContain("Reset to blockie");

    const resetBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Reset to blockie")
    );
    expect(resetBtn).toBeDefined();

    act(() => {
      resetBtn!.click();
    });

    expect(container.textContent).toContain("Default Blockie");
    expect(container.textContent).toContain("Avatar removed. Reset to default blockie.");
  });

  it("renders Gas Efficiency KPI card displaying lifetime gas savings (#785)", () => {
    walletState.connected = true;
    walletState.publicKey = "GABCDE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF";
    walletState.walletName = "Freighter";
    const container = renderProfilePage();

    expect(container.textContent).toContain("Gas Efficiency");
    const kpiCard = container.querySelector('[data-testid="gas-efficiency-card"]');
    expect(kpiCard).not.toBeNull();
    expect(kpiCard?.textContent).toContain("Lifetime Gas Fees Saved");
    expect(kpiCard?.textContent).toContain("Withdrawals Avoided");
    expect(kpiCard?.textContent).toContain("Avg Fee per Payout");
  });
});
