import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ConnectButton } from '../ConnectButton';

/**
 * ConnectButton — provider routing for the Ledger (WebHID) option (#792).
 */

const { walletMock } = vi.hoisted(() => ({
  walletMock: {
    connected: false,
    connecting: false,
    publicKey: null as string | null,
    walletName: null as string | null,
    connect: vi.fn(async (_walletId?: string) => undefined),
    disconnect: vi.fn(),
  },
}));

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => walletMock,
}));

vi.mock('@/components/ui/CopyAddress', () => ({
  CopyAddress: ({ address }: { address: string }) => <span>{address}</span>,
}));

describe('ConnectButton — Ledger', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'hid', { value: {}, configurable: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (navigator as any).hid;
  });

  function buttonWithText(text: string) {
    return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
  }

  it('passes the "ledger" provider id through to connect() and caches it', async () => {
    act(() => root.render(<ConnectButton />));
    act(() => buttonWithText('Connect wallet').click());
    await act(async () => {
      buttonWithText('Ledger').click();
    });

    expect(walletMock.connect).toHaveBeenCalledWith('ledger');
    expect(JSON.parse(localStorage.getItem('streamfi_last_wallet')!).providerId).toBe('ledger');
  });

  it('shows the Ledger error message when the connection fails', async () => {
    walletMock.connect.mockRejectedValueOnce(new Error('Open the Stellar app on your Ledger and try again.'));
    act(() => root.render(<ConnectButton />));
    act(() => buttonWithText('Connect wallet').click());
    await act(async () => {
      buttonWithText('Ledger').click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Open the Stellar app on your Ledger and try again.',
    );
  });

  it('does not silently re-prompt a cached Ledger on mount (WebHID needs a user gesture)', () => {
    localStorage.setItem(
      'streamfi_last_wallet',
      JSON.stringify({ providerId: 'ledger', expires: Date.now() + 60_000 }),
    );
    act(() => root.render(<ConnectButton />));
    expect(walletMock.connect).not.toHaveBeenCalled();
  });

  it('silently reconnects a cached extension wallet with its provider id', () => {
    localStorage.setItem(
      'streamfi_last_wallet',
      JSON.stringify({ providerId: 'freighter', expires: Date.now() + 60_000 }),
    );
    act(() => root.render(<ConnectButton />));
    expect(walletMock.connect).toHaveBeenCalledWith('freighter');
  });
});
