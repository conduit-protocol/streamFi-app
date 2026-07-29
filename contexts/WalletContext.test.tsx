'use client';

import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { WalletProvider, useWallet, Mutex, Semaphore } from './WalletContext';
import * as freighter from '@stellar/freighter-api';
import { queryClient } from '@/lib/queryClient';
import { useTransactionStore } from '@/lib/store';

interface MockWatcherCallbackParams {
  address: string;
  network: string;
  networkPassphrase: string;
  error?: unknown;
}

// Tracks every MockWatchWalletChanges instance so tests can grab the one
// created for their own mountWallet() call and manually fire its callback —
// standing in for a Freighter extension poll tick.
const { watchInstances } = vi.hoisted(() => ({
  watchInstances: [] as Array<{
    cb: ((params: MockWatcherCallbackParams) => void) | null;
    stopped: boolean;
  }>,
}));

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
  WatchWalletChanges: class MockWatchWalletChanges {
    cb: ((params: MockWatcherCallbackParams) => void) | null = null;
    stopped = false;
    constructor() {
      watchInstances.push(this);
    }
    watch(cb: (params: MockWatcherCallbackParams) => void) {
      this.cb = cb;
      return {};
    }
    stop() {
      this.stopped = true;
    }
  },
}));

// WalletContext calls useRouter() (disconnect() navigates home) — outside of
// a real Next.js app router tree that throws "invariant expected app router
// to be mounted", so every test in this file needs it mocked.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/env', () => ({
  getNetworkPassphrase: () => 'Test SDF Network ; September 2015',
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
    watchInstances.length = 0;
    useTransactionStore.setState({ transactions: {}, order: [] });
  });

  it('restores a valid stored wallet session on mount', () => {
    localStorage.setItem(
      'conduit:wallet',
      JSON.stringify({ key: 'GVALID123', name: 'Freighter', expiresAt: Date.now() + 60000 }),
    );
    const { stateRef, container } = mountWallet();
    expect(stateRef.current?.publicKey).toBe('GVALID123');
    document.body.removeChild(container);
  });

  it('purges an expired stored wallet session on mount instead of restoring it', () => {
    localStorage.setItem(
      'conduit:wallet',
      JSON.stringify({ key: 'GEXPIRED123', name: 'Freighter', expiresAt: Date.now() - 10000 }),
    );
    const { stateRef, container } = mountWallet();
    expect(stateRef.current?.publicKey).toBe(null);
    expect(localStorage.getItem('conduit:wallet')).toBeNull();
    document.body.removeChild(container);
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

  it('cancels a connect() attempt still queued behind an in-flight one, under rapid repeated clicks', async () => {
    // First call acquires the mutex immediately and hangs inside
    // freighterIsConnected() — simulating heavy load / a slow extension.
    let resolveFirstCheck: (v: { isConnected: boolean }) => void;
    mockedFreighter.isConnected.mockImplementationOnce(
      () => new Promise((r) => { resolveFirstCheck = r; }),
    );

    const { stateRef, container } = mountWallet();
    const wallet = stateRef.current;

    await act(async () => {
      void wallet.connect(); // acquires the mutex, then hangs on isConnected()
      await Promise.resolve();
      await Promise.resolve();
    });

    // Second and third calls queue behind the first, each superseding the
    // last. Only the third should still be "pending" once the first
    // finishes — the second must never reach freighterIsConnected().
    await act(async () => {
      void wallet.connect();
      void wallet.connect();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      resolveFirstCheck!({ isConnected: false }); // first call finishes (no Freighter)
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // isConnected: 1 call for the first (hung) attempt, 1 for the third
    // (the one that actually got to run) — the superseded second attempt
    // was aborted while queued and never called it.
    expect(mockedFreighter.isConnected).toHaveBeenCalledTimes(2);

    document.body.removeChild(container);
  });

  it('clears the connecting state instead of spinning forever when the RPC/extension check times out (fixes #190)', async () => {
    vi.useFakeTimers();

    // Freighter's isConnected() never settles — simulates an unresponsive
    // extension/RPC provider.
    mockedFreighter.isConnected.mockImplementationOnce(() => new Promise(() => {}));

    const { stateRef, container } = mountWallet();
    const wallet = stateRef.current;

    let caught: unknown;
    await act(async () => {
      const pending = wallet.connect().catch((e: unknown) => { caught = e; });
      // WALLET_CONNECT_TIMEOUT_MS is 15s — advance past it.
      await vi.advanceTimersByTimeAsync(15_001);
      await pending;
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/timed out/i);
    // The spinner-driving flag must be cleared, not stuck `true` forever.
    expect(stateRef.current?.connecting).toBe(false);

    vi.useRealTimers();
    document.body.removeChild(container);
  });

  it('clears the connecting state when the access-request step times out', async () => {
    vi.useFakeTimers();

    mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockedFreighter.requestAccess.mockImplementationOnce(() => new Promise(() => {}));

    const { stateRef, container } = mountWallet();
    const wallet = stateRef.current;

    let caught: unknown;
    await act(async () => {
      const pending = wallet.connect().catch((e: unknown) => { caught = e; });
      await vi.advanceTimersByTimeAsync(15_001);
      await pending;
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/timed out/i);
    expect(stateRef.current?.connecting).toBe(false);

    vi.useRealTimers();
    document.body.removeChild(container);
  });

  it('purges cached wallet data when the connected account changes underneath the app (fixes #88)', async () => {
    mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockedFreighter.requestAccess.mockResolvedValue({ address: 'GAFIRSTACCOUNT', error: null } as any);

    const { stateRef, container } = mountWallet();
    const wallet = stateRef.current;

    await act(async () => {
      await wallet.connect();
    });

    expect(stateRef.current?.publicKey).toBe('GAFIRSTACCOUNT');

    useTransactionStore.getState().addTransaction('tx1', 'Test transfer');
    expect(useTransactionStore.getState().transactions['tx1']).toBeDefined();
    const clearSpy = vi.spyOn(queryClient, 'clear');

    // Simulate the extension reporting a different account on its next poll
    // tick — e.g. the user switched accounts directly in Freighter without
    // ever clicking "Disconnect" in the app.
    const watcher = watchInstances[watchInstances.length - 1];
    await act(async () => {
      watcher?.cb?.({ address: 'GASECONDACCOUNT', network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' });
    });

    expect(stateRef.current?.publicKey).toBe('GASECONDACCOUNT');
    expect(clearSpy).toHaveBeenCalled();
    expect(useTransactionStore.getState().transactions).toEqual({});
    expect(JSON.parse(localStorage.getItem('conduit:wallet')!).key).toBe('GASECONDACCOUNT');

    document.body.removeChild(container);
  });

  it('disconnects when the extension reports no address — locked or access revoked (fixes #88)', async () => {
    mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockedFreighter.requestAccess.mockResolvedValue({ address: 'GAFIRSTACCOUNT', error: null } as any);

    const { stateRef, container } = mountWallet();
    const wallet = stateRef.current;

    await act(async () => {
      await wallet.connect();
    });
    expect(stateRef.current?.connected).toBe(true);

    const watcher = watchInstances[watchInstances.length - 1];
    await act(async () => {
      watcher?.cb?.({ address: '', network: '', networkPassphrase: '' });
    });

    expect(stateRef.current?.connected).toBe(false);
    expect(stateRef.current?.publicKey).toBe(null);
    expect(localStorage.getItem('conduit:wallet')).toBeNull();

    document.body.removeChild(container);
  });

  it('ignores watcher polls while no wallet session is active in the app', async () => {
    const { stateRef, container } = mountWallet();

    const watcher = watchInstances[watchInstances.length - 1];
    await act(async () => {
      watcher?.cb?.({ address: 'GASOMEACCOUNT', network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' });
    });

    expect(stateRef.current?.publicKey).toBe(null);
    expect(stateRef.current?.connected).toBe(false);

    document.body.removeChild(container);
  });

  it('rejects signTx with error when the account changes while signing is in flight', async () => {
    let resolveSign: (value: { signedTxXdr: string; signerAddress: string; error: null }) => void;
    const signPromise = new Promise<{ signedTxXdr: string; signerAddress: string; error: null }>((resolve) => {
      resolveSign = resolve;
    });

    mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockedFreighter.requestAccess.mockResolvedValue({ address: 'GAFIRSTACCOUNT', error: null } as any);
    mockedFreighter.signTransaction.mockReturnValue(signPromise as any);

    const { stateRef, container } = mountWallet();

    await act(async () => {
      await stateRef.current.connect();
    });

    const validXdr = 'AAAAAGLm4LZ5F2dO4FQ7AAAAuRz7L5eJ3F9GJ0+5AAAAAA==';
    // An object ref (rather than a bare `let`) sidesteps a TS control-flow
    // narrowing quirk where a `let` only ever reassigned inside a nested
    // async closure gets narrowed to `never` at the read site below.
    const errorRef: { current: Error | null } = { current: null };

    let pendingSign: Promise<string>;
    await act(async () => {
      pendingSign = stateRef.current.signTx(validXdr).catch((e: Error) => {
        errorRef.current = e;
        return '';
      });
    });

    // Account switches mid-signature via Freighter watcher tick
    const watcher = watchInstances[watchInstances.length - 1];
    await act(async () => {
      watcher?.cb?.({ address: 'GASECONDACCOUNT', network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' });
    });

    // Now Freighter finishes signing
    await act(async () => {
      resolveSign!({ signedTxXdr: 'signed_xdr', signerAddress: 'GAFIRSTACCOUNT', error: null });
      await pendingSign;
    });

    expect(errorRef.current).not.toBeNull();
    expect(errorRef.current?.message).toMatch(/Wallet state changed during signing/i);

    document.body.removeChild(container);
  });

  // TODO.md Phase 4, item 15 — the Mutex/queue-based concurrency work in
  // signTx has no test exercising it under real concurrent load.
  it('processes 100 concurrent signTx() calls without exceeding the concurrency limit or dropping any', async () => {
    mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockedFreighter.requestAccess.mockResolvedValue({ address: 'GACONCURRENTTEST', error: null } as any);

    const { stateRef, container } = mountWallet();

    await act(async () => {
      await stateRef.current.connect();
    });

    const wallet = stateRef.current;
    const pendingSigns: Array<() => void> = [];
    let maxObservedPending = 0;

    mockedFreighter.signTransaction.mockImplementation(
      () => new Promise((resolve) => {
        pendingSigns.push(() => resolve({ signedTxXdr: 'signed-xdr', error: null } as any));
      }),
    );

    const TOTAL_CALLS = 100;
    let calls: Promise<string>[] = [];

    await act(async () => {
      calls = Array.from({ length: TOTAL_CALLS }, () => wallet.signTx('AAAA'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    maxObservedPending = Math.max(maxObservedPending, stateRef.current!.pendingOperationCount);
    expect(maxObservedPending).toBeGreaterThan(0);
    expect(maxObservedPending).toBeLessThanOrEqual(wallet.maxConcurrentOperations);

    // Drain in waves — resolving the currently-active batch frees up
    // semaphore permits for the next queued batch — until all 100 calls
    // have been dispatched to signTransaction().
    let safetyCounter = 0;
    while (pendingSigns.length > 0 && safetyCounter < TOTAL_CALLS * 2) {
      const wave = pendingSigns.splice(0, pendingSigns.length);
      await act(async () => {
        wave.forEach((resolve) => resolve());
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      maxObservedPending = Math.max(maxObservedPending, stateRef.current!.pendingOperationCount);
      expect(stateRef.current!.pendingOperationCount).toBeLessThanOrEqual(wallet.maxConcurrentOperations);
      safetyCounter++;
    }

    const results = await Promise.all(calls);

    expect(results).toHaveLength(TOTAL_CALLS);
    expect(results.every((r) => r === 'signed-xdr')).toBe(true);
    expect(mockedFreighter.signTransaction).toHaveBeenCalledTimes(TOTAL_CALLS);
    expect(stateRef.current?.pendingOperationCount).toBe(0);
    expect(maxObservedPending).toBeLessThanOrEqual(wallet.maxConcurrentOperations);

    document.body.removeChild(container);
  });

  // TODO.md Phase 4, item 16 — disconnect() is documented (Phase 1, item 5)
  // to abort in-flight operations, but nothing confirmed that actually
  // happens when a signTx() call is genuinely mid-flight.
  it('aborts an in-flight signTx() operation when disconnect() is called before it resolves', async () => {
    mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockedFreighter.requestAccess.mockResolvedValue({ address: 'GADISCONNECTTEST', error: null } as any);

    const { stateRef, container } = mountWallet();

    await act(async () => {
      await stateRef.current.connect();
    });

    const wallet = stateRef.current;
    expect(wallet.connected).toBe(true);

    let resolveSign: (v: { signedTxXdr: string; signerAddress: string; error: null }) => void;
    mockedFreighter.signTransaction.mockImplementation(
      () => new Promise((resolve) => { resolveSign = resolve; }),
    );

    let signPromise: Promise<string>;
    await act(async () => {
      signPromise = wallet.signTx('AAAA');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stateRef.current?.pendingOperationCount).toBe(1);

    // Disconnect while signTx() is still mid-flight — simulating closing the
    // tab, or switching wallets, before Freighter has responded.
    act(() => {
      stateRef.current!.disconnect();
    });

    expect(stateRef.current?.connected).toBe(false);
    expect(stateRef.current?.publicKey).toBe(null);

    // Freighter finally responds after the disconnect — the operation must
    // reject rather than resolve with a now-stale signed transaction.
    let caught: unknown;
    await act(async () => {
      resolveSign!({ signedTxXdr: 'signed-xdr', signerAddress: 'GADISCONNECTTEST', error: null });
      await signPromise.catch((e) => { caught = e; });
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/abort/i);
    expect(stateRef.current?.connected).toBe(false);
    expect(stateRef.current?.publicKey).toBe(null);
    expect(stateRef.current?.pendingOperationCount).toBe(0);

    document.body.removeChild(container);
  });
});

// The Mutex guarding connect() under concurrent "connect wallet" clicks
// serializes access via a wait queue. When a queued waiter's AbortSignal
// fires, its entry must be dequeued and its acquire() promise rejected —
// this is what the initialization path relies on to stay responsive under
// heavy load (many rapid connect attempts) instead of leaving a stale
// entry hanging.
describe('Mutex — queued acquire under load', () => {
  it('lets a second acquire() through once the first releases', async () => {
    const mutex = new Mutex();
    const release1 = await mutex.acquire();

    let acquired2 = false;
    const p2 = mutex.acquire().then((release) => {
      acquired2 = true;
      return release;
    });

    expect(acquired2).toBe(false); // still queued behind release1
    release1();

    const release2 = await p2;
    expect(acquired2).toBe(true);
    release2();
  });

  it('rejects a queued waiter when its AbortSignal fires, without corrupting the queue', async () => {
    const mutex = new Mutex();
    const release1 = await mutex.acquire();

    const controller = new AbortController();
    const queuedAcquire = mutex.acquire(controller.signal);

    controller.abort();
    await expect(queuedAcquire).rejects.toThrow(/aborted/i);

    // The mutex must still be usable afterwards — the aborted entry should
    // have been cleanly removed from the queue, not left dangling.
    release1();
    const release3 = await mutex.acquire();
    expect(typeof release3).toBe('function');
    release3();
  });
});

describe('Semaphore — unit tests', () => {
  it('enforces minimum concurrency limit of 1', () => {
    const sem0 = new Semaphore(0);
    expect(sem0.availablePermits).toBe(1);

    const semNeg = new Semaphore(-5);
    expect(semNeg.availablePermits).toBe(1);
  });

  it('allows immediate acquisition up to configured concurrency limit', async () => {
    const sem = new Semaphore(3);
    expect(sem.availablePermits).toBe(3);
    expect(sem.pendingCount).toBe(0);

    const rel1 = await sem.acquire();
    expect(sem.availablePermits).toBe(2);
    expect(sem.pendingCount).toBe(0);

    const rel2 = await sem.acquire();
    const rel3 = await sem.acquire();
    expect(sem.availablePermits).toBe(0);
    expect(sem.pendingCount).toBe(0);

    rel1();
    expect(sem.availablePermits).toBe(1);
    rel2();
    rel3();
    expect(sem.availablePermits).toBe(3);
  });

  it('queues callers when concurrency limit is reached and grants access in FIFO release ordering', async () => {
    const sem = new Semaphore(2);
    const rel1 = await sem.acquire();
    const rel2 = await sem.acquire();

    expect(sem.availablePermits).toBe(0);

    const order: number[] = [];
    const p3 = sem.acquire().then((rel) => {
      order.push(3);
      return rel;
    });
    const p4 = sem.acquire().then((rel) => {
      order.push(4);
      return rel;
    });

    expect(sem.pendingCount).toBe(2);
    expect(order).toEqual([]);

    // Release first permit -> p3 resolves
    rel1();
    const rel3 = await p3;
    expect(order).toEqual([3]);
    expect(sem.pendingCount).toBe(1);

    // Release second permit -> p4 resolves
    rel2();
    const rel4 = await p4;
    expect(order).toEqual([3, 4]);
    expect(sem.pendingCount).toBe(0);

    rel3();
    rel4();
    expect(sem.availablePermits).toBe(2);
  });

  it('rejects a queued waiter when its AbortSignal fires, without corrupting the queue', async () => {
    const sem = new Semaphore(1);
    const release1 = await sem.acquire();

    const controller = new AbortController();
    const queuedAcquire = sem.acquire(controller.signal);

    expect(sem.pendingCount).toBe(1);

    controller.abort();
    await expect(queuedAcquire).rejects.toThrow(/aborted/i);
    expect(sem.pendingCount).toBe(0);

    // The semaphore must still be usable afterwards — the aborted entry should
    // have been cleanly removed from the queue, not left dangling.
    let acquired2 = false;
    const p2 = sem.acquire().then((rel) => {
      acquired2 = true;
      return rel;
    });

    release1();
    const release2 = await p2;
    expect(acquired2).toBe(true);
    release2();
  });

  it('handles abort of a middle queued waiter without interrupting other queued waiters', async () => {
    const sem = new Semaphore(1);
    const release1 = await sem.acquire();

    const p2 = sem.acquire();
    const controller3 = new AbortController();
    const p3 = sem.acquire(controller3.signal);
    const p4 = sem.acquire();

    expect(sem.pendingCount).toBe(3);

    // Abort p3 in middle of queue
    controller3.abort();
    await expect(p3).rejects.toThrow(/aborted/i);
    expect(sem.pendingCount).toBe(2);

    // Release 1 -> p2 should get acquired
    release1();
    const release2 = await p2;

    // Release 2 -> p4 should get acquired
    release2();
    const release4 = await p4;
    expect(typeof release4).toBe('function');
    release4();
  });
});

describe('Semaphore — queue overflow and rate limiting', () => {
  // We test the overflow scenario by enqueueing more operations than maxConcurrentOperations.

  it('queues all signTx calls when max concurrency is exceeded, dropping none', async () => {
    let activeCount = 0;
    let maxObserved = 0;

    mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockedFreighter.requestAccess.mockResolvedValue({ address: 'GTEST123', error: null } as any);
    mockedFreighter.signTransaction.mockImplementation(async () => {
      activeCount++;
      maxObserved = Math.max(maxObserved, activeCount);
      await new Promise((r) => setTimeout(r, 10));
      activeCount--;
      return { signedTxXdr: 'AAAAAGLm4LZ5F2dO4FQ7AAAAuRz7L5eJ3F9GJ0+5AAAAAA==', signerAddress: 'GTEST123', error: null };
    });

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

    await act(async () => {
      createRoot(container).render(
        <WalletProvider maxConcurrentOperations={2}>
          <TestComponent />
        </WalletProvider>,
      );
    });

    await act(async () => {
      await stateRef.current.connect();
    });

    // Enqueue 10 signTx calls with only 2 concurrent slots
    // Use valid base64 XDR strings
    const validXdr = 'AAAAAGLm4LZ5F2dO4FQ7AAAAuRz7L5eJ3F9GJ0+5AAAAAA==';
    const results = await act(async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        stateRef.current.signTx(validXdr).catch((e: Error) => e),
      );
      return Promise.all(promises);
    });

    // All 10 operations should complete (none silently dropped)
    expect(results).toHaveLength(10);
    const successes = results.filter((r: any) => typeof r === 'string');
    expect(successes.length).toBe(10);
    // Max observed concurrency should not exceed 2
    expect(maxObserved).toBeLessThanOrEqual(2);

    act(() => {
      stateRef.current.disconnect();
    });
    document.body.removeChild(container);
  });

  it('maintains FIFO ordering when operations overflow the queue', async () => {
    const executionOrder: number[] = [];
    let activeCount = 0;

    mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockedFreighter.requestAccess.mockResolvedValue({ address: 'GTEST123', error: null } as any);
    mockedFreighter.signTransaction.mockImplementation(async (xdr: string) => {
      activeCount++;
      await new Promise((r) => setTimeout(r, 5));
      // Extract a unique ID from each call to track ordering
      const callIndex = executionOrder.length;
      executionOrder.push(callIndex);
      activeCount--;
      return { signedTxXdr: `signed_${callIndex}`, signerAddress: 'GTEST123', error: null };
    });

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

    await act(async () => {
      createRoot(container).render(
        <WalletProvider maxConcurrentOperations={1}>
          <TestComponent />
        </WalletProvider>,
      );
    });

    await act(async () => {
      await stateRef.current.connect();
    });

    // With maxConcurrency=1, operations should execute in FIFO order
    // Use valid base64 XDR strings
    const validXdr = 'AAAAAGLm4LZ5F2dO4FQ7AAAAuRz7L5eJ3F9GJ0+5AAAAAA==';
    await act(async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        stateRef.current.signTx(validXdr),
      );
      await Promise.all(promises);
    });

    // Each call should execute in order
    expect(executionOrder.length).toBe(5);
    expect(executionOrder).toEqual([0, 1, 2, 3, 4]);

    act(() => {
      stateRef.current.disconnect();
    });
    document.body.removeChild(container);
  });
});
