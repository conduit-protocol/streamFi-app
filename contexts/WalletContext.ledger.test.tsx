'use client';

import React, { useEffect, act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { WalletProvider, useWallet, type WalletState } from './WalletContext';
import * as ledger from '@/lib/ledger-wallet';

/**
 * WalletContext — Ledger hardware wallet integration (#792).
 *
 * `@/lib/ledger-wallet` is mocked at the device boundary (its own tests cover
 * the transport); these tests cover how the context routes connect / signTx /
 * disconnect for a Ledger session and keeps Freighter's watcher out of it.
 */

const LEDGER_KEY = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';

const { watchInstances, ledgerState } = vi.hoisted(() => ({
  watchInstances: [] as Array<{ cb: ((p: { address: string; networkPassphrase: string }) => void) | null }>,
  ledgerState: { disconnectHandler: null as (() => void) | null },
}));

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getNetwork: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
  WatchWalletChanges: class {
    cb: ((p: { address: string; networkPassphrase: string }) => void) | null = null;
    constructor() {
      watchInstances.push(this);
    }
    watch(cb: (p: { address: string; networkPassphrase: string }) => void) {
      this.cb = cb;
      return {};
    }
    stop() {}
  },
}));

vi.mock('@/lib/ledger-wallet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ledger-wallet')>();
  return {
    ...actual,
    connectLedger: vi.fn(),
    signWithLedger: vi.fn(),
    closeLedger: vi.fn(async () => undefined),
    onLedgerDisconnect: vi.fn((handler: (() => void) | null) => {
      ledgerState.disconnectHandler = handler;
    }),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/env', () => ({
  getNetworkPassphrase: () => 'Test SDF Network ; September 2015',
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() });
  return { default: toast };
});

const mockedLedger = vi.mocked(ledger, true);

describe('WalletContext — Ledger', () => {
  let container: HTMLDivElement;
  let root: Root;
  const stateRef = { current: null as WalletState | null };

  function mount() {
    function Probe() {
      const wallet = useWallet();
      useEffect(() => {
        stateRef.current = wallet;
      }, [wallet]);
      return null;
    }
    act(() => {
      root.render(
        <WalletProvider>
          <Probe />
        </WalletProvider>,
      );
    });
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    watchInstances.length = 0;
    ledgerState.disconnectHandler = null;
    stateRef.current = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockedLedger.connectLedger.mockResolvedValue(LEDGER_KEY);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function connectLedger() {
    await act(async () => {
      await stateRef.current!.connect('ledger');
    });
  }

  it('connects a Ledger and persists the session under the "Ledger" wallet name', async () => {
    mount();
    await connectLedger();

    expect(mockedLedger.connectLedger).toHaveBeenCalledTimes(1);
    expect(stateRef.current?.publicKey).toBe(LEDGER_KEY);
    expect(stateRef.current?.walletName).toBe('Ledger');
    expect(stateRef.current?.connecting).toBe(false);
    expect(JSON.parse(localStorage.getItem('conduit:wallet')!)).toMatchObject({ key: LEDGER_KEY, name: 'Ledger' });
  });

  it('surfaces Ledger errors (e.g. locked device) and stays disconnected', async () => {
    mockedLedger.connectLedger.mockRejectedValue(
      new ledger.LedgerError('locked', 'Your Ledger is locked. Unlock it with your PIN and try again.'),
    );
    mount();

    await act(async () => {
      await expect(stateRef.current!.connect('ledger')).rejects.toThrow(/locked/);
    });
    expect(stateRef.current?.connected).toBe(false);
    expect(stateRef.current?.connecting).toBe(false);
  });

  it('routes signTx to the Ledger for a Ledger session', async () => {
    mockedLedger.signWithLedger.mockResolvedValue('SIGNED_XDR');
    mount();
    await connectLedger();

    let signed: string | undefined;
    await act(async () => {
      signed = await stateRef.current!.signTx('AAAA');
    });

    expect(signed).toBe('SIGNED_XDR');
    expect(mockedLedger.signWithLedger).toHaveBeenCalledWith('AAAA', 'Test SDF Network ; September 2015', LEDGER_KEY);
  });

  it('ignores the Freighter watcher reporting no address while a Ledger is connected', async () => {
    mount();
    await connectLedger();

    act(() => {
      watchInstances.at(-1)!.cb!({ address: '', networkPassphrase: '' });
    });

    expect(stateRef.current?.publicKey).toBe(LEDGER_KEY);
  });

  it('tears the session down when the Ledger is unplugged', async () => {
    mount();
    await connectLedger();
    expect(ledgerState.disconnectHandler).toBeTypeOf('function');

    act(() => {
      ledgerState.disconnectHandler!();
    });

    expect(stateRef.current?.connected).toBe(false);
    expect(localStorage.getItem('conduit:wallet')).toBeNull();
  });

  it('releases the device on explicit disconnect', async () => {
    mount();
    await connectLedger();

    act(() => {
      stateRef.current!.disconnect();
    });

    expect(mockedLedger.closeLedger).toHaveBeenCalled();
    expect(stateRef.current?.connected).toBe(false);
  });
});
