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

vi.mock("@/contexts/WalletContext", () => ({
  useWallet: () => ({
    publicKey: walletState.publicKey,
    connected: walletState.connected,
    walletName: walletState.walletName,
    connecting: walletState.connecting,
    connect: vi.fn(),
    disconnect: vi.fn(),
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
});
