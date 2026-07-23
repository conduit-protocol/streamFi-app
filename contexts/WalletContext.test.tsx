'use client';

import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { WalletProvider, useWallet } from './WalletContext';
import * as freighter from '@stellar/freighter-api';

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}));

const mockedFreighter = vi.mocked(freighter, true);

function mountWallet() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const stateRef = { current: null as any };

  function TestComponent() {
    const wallet = useWallet();
    useEffect(() => {
      stateRef.current = wallet;
    }, [wallet]);
    return null;
  }

  act(() => {
    createRoot(container).render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );
  });

  return { stateRef, container };
}

describe('WalletContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('prevents stale async connection state from applying after disconnect', async () => {
    let resolveConnect: (value: { address: string; error: null }) => void;
    const connectPromise = new Promise<{ address: string; error: null }>((resolve) => {
      resolveConnect = resolve;
    });

    mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockedFreighter.requestAccess.mockReturnValue(connectPromise as any);

    const { stateRef, container } = mountWallet();
    const wallet = stateRef.current;

    act(() => {
      void wallet.connect();
    });

    act(() => {
      wallet.disconnect();
    });

    act(() => {
      resolveConnect!({ address: 'GA123TEST', error: null });
    });

    await act(async () => {
      await connectPromise;
    });

    expect(stateRef.current?.connected).toBe(false);
    expect(stateRef.current?.publicKey).toBe(null);
    expect(localStorage.getItem('conduit:wallet')).toBeNull();

    document.body.removeChild(container);
  });
});
