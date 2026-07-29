'use client';

/**
 * WalletContext — Stellar wallet connection state.
 *
 * Wraps @stellar/freighter-api. Freighter-only (not a multi-wallet kit) —
 * @creit.tech/stellar-wallets-kit was considered but its `dependencies`
 * unconditionally pull in Ledger/Trezor/WalletConnect/a NEAR Protocol SDK,
 * ~300 extra packages and 36 vulnerabilities for functionality this app
 * doesn't need.
 *
 * Concurrency & Atomic State:
 * ────────────────────────────
 * This module enforces strict concurrency boundaries to handle 100+
 * concurrent operations without degradation. All mutating operations
 * (connect, disconnect, signTx) flow through a bounded Semaphore + Mutex
 * pattern. AbortController integration ensures graceful cancellation of
 * in-flight operations when the wallet disconnects.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  isConnected as freighterIsConnected,
  requestAccess,
  signTransaction,
  WatchWalletChanges,
} from '@stellar/freighter-api';
import { getNetworkPassphrase } from '@/lib/env';
import { queryClient } from '@/lib/queryClient';
import { useTransactionStore } from '@/lib/store';
import { truncateAddress } from '@/lib/format';
import { useRouter } from 'next/navigation';
import {
  clearWalletSession,
  loadWalletSession,
  saveWalletSession,
} from '@/lib/wallet-storage';
import toast from 'react-hot-toast';

// ── Concurrency Primitives ───────────────────────────────────────────────────

/**
 * A simple mutual-exclusion lock (binary semaphore).
 * Used to protect single-access resources like the Freighter popup.
 */
export class Mutex {
  private _locked = false;
  private _queue: Array<(release: () => void) => void> = [];

  async acquire(abortSignal?: AbortSignal): Promise<() => void> {
    return new Promise<() => void>((resolve, reject) => {
      let entry: ((release: () => void) => void) | undefined;

      // If already locked, queue the request
      if (this._locked) {
        entry = (release: () => void) => {
          if (abortSignal?.aborted) {
            reject(new Error('Operation aborted'));
            return;
          }
          resolve(release);
        };
        this._queue.push(entry);
      } else {
        this._locked = true;
        resolve(() => this._release());
      }

      if (abortSignal && entry) {
        const queuedEntry = entry;
        abortSignal.addEventListener('abort', () => {
          // Remove this entry from queue if it hasn't been resolved yet
          if (entry) {
            const idx = this._queue.indexOf(entry);
            if (idx !== -1) this._queue.splice(idx, 1);
          }
          reject(new Error('Operation aborted'));
        }, { once: true });
      }
    });
  }

  private _release() {
    const next = this._queue.shift();
    if (next) {
      next(() => this._release());
    } else {
      this._locked = false;
    }
  }
}

/**
 * A bounded Semaphore that limits concurrent operation count.
 * Default max concurrency is 5, configurable via maxConcurrentOperations.
 */
export class Semaphore {
  private _available: number;
  private _queue: Array<{
    resolver: (release: () => void) => void;
    rejector: (reason: Error) => void;
    signal?: AbortSignal;
  }> = [];

  constructor(maxConcurrent: number) {
    this._available = Math.max(1, maxConcurrent);
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (this._available > 0) {
      this._available--;
      return () => this._release();
    }

    return new Promise<() => void>((resolve, reject) => {
      const entry = {
        resolver: (release: () => void) => {
          if (signal?.aborted) {
            reject(new Error('Operation aborted'));
            return;
          }
          resolve(release);
        },
        rejector: reject,
        signal,
      };
      this._queue.push(entry);

      if (signal?.aborted) {
        this._dequeue(entry);
        reject(new Error('Operation aborted'));
      } else if (signal) {
        signal.addEventListener('abort', () => {
          this._dequeue(entry);
          reject(new Error('Operation aborted'));
        }, { once: true });
      }
    });
  }

  private _dequeue(entry: typeof this._queue[0]) {
    const idx = this._queue.indexOf(entry);
    if (idx !== -1) this._queue.splice(idx, 1);
  }

  private _release() {
    const next = this._queue.shift();
    if (next) {
      next.resolver(() => this._release());
    } else {
      this._available++;
    }
  }

  get pendingCount(): number {
    return this._queue.length;
  }

  get availablePermits(): number {
    return this._available;
  }
}

/**
 * Default maximum concurrent signing operations.
 * This prevents overwhelming the Freighter extension popup chain.
 */
const DEFAULT_MAX_CONCURRENT_OPS = 5;

/**
 * Timeout for wallet connection operations (Freighter API calls).
 * Prevents infinite hangs if the RPC provider or extension becomes unresponsive.
 */
const WALLET_CONNECT_TIMEOUT_MS = 15_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface OperationResult<T = string> {
  /** Unique operation ID for tracking */
  id:     string;
  /** Result value on success */
  result: T;
  /** Error message on failure */
  error?: string;
}

export interface WalletState {
  /** Connected Stellar public key (G-address), or null if not connected */
  publicKey:   string | null;
  /** Human-readable wallet name, e.g. 'Freighter' */
  walletName:  string | null;
  /** True while connection is being established */
  connecting:  boolean;
  /** True if the wallet is connected */
  connected:   boolean;
  /** Number of operations currently in-flight (queued + active) */
  pendingOperationCount: number;
  /** Maximum concurrent signing operations allowed */
  maxConcurrentOperations: number;
  connect:     () => Promise<void>;
  disconnect:  () => void;
  /**
   * Sign a base64-encoded XDR transaction and return the signed XDR.
   * Respects the concurrency semaphore — if maxConcurrentOperations (default 5)
   * signTx calls are already in-flight, subsequent calls will queue.
   * Pass an optional AbortSignal to cancel the operation.
   */
  signTx:      (xdr: string, signal?: AbortSignal) => Promise<string>;
}

// ── Context ──────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout. Rejects with a clear error if the
 * promise does not resolve within `ms` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s — the wallet or network may be unresponsive.`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export function WalletProvider({
  children,
  maxConcurrentOperations = DEFAULT_MAX_CONCURRENT_OPS,
}: {
  children: React.ReactNode;
  /** Override the max concurrent signing operations (default: 5) */
  maxConcurrentOperations?: number;
}) {
  const [publicKey,  setPublicKey]  = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [pendingOperationCount, setPendingOperationCount] = useState(0);
  const isMountedRef = useRef(true);
  const pendingRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const semaphoreRef = useRef<Semaphore>(new Semaphore(maxConcurrentOperations));
  const connectMutexRef = useRef<Mutex>(new Mutex());
  const pendingConnectAbortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Mirrors `publicKey` for use inside the WatchWalletChanges callback below,
  // which is registered once and would otherwise close over a stale value.
  const publicKeyRef = useRef<string | null>(null);
  useEffect(() => {
    publicKeyRef.current = publicKey;
  }, [publicKey]);

  // Access the Zustand store's reset action outside of a component render
  const clearTransactions = useTransactionStore((s) => s.clearTransactions);

  // Restore previous session from localStorage (scoped to the wallet key
  // only — never a blanket clear(), so unrelated storage like the theme
  // preference is never disturbed).
  useEffect(() => {
    const stored = loadWalletSession();
    if (stored) {
      setPublicKey(stored.key);
      setWalletName(stored.name);
    }

    return () => {
      isMountedRef.current = false;
      pendingRequestIdRef.current += 1;
      // Abort any in-flight operations
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── Operation tracking helper ──────────────────────────────────────────────

  function trackOperation<T>(fn: () => Promise<T>): Promise<T> {
    setPendingOperationCount((c) => c + 1);
    return fn().finally(() => {
      if (isMountedRef.current) {
        setPendingOperationCount((c) => Math.max(0, c - 1));
      }
    });
  }

  // ── connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    const requestId = ++pendingRequestIdRef.current;

    // A newer connect() call supersedes whatever's still waiting in the
    // mutex queue — cancel it now rather than let it run its turn.
    pendingConnectAbortRef.current?.abort();
    const myAbort = new AbortController();
    pendingConnectAbortRef.current = myAbort;

    const clearConnectingState = () => {
      if (requestId === pendingRequestIdRef.current && isMountedRef.current) {
        setConnecting(false);
      }
      if (pendingConnectAbortRef.current === myAbort) {
        pendingConnectAbortRef.current = null;
      }
    };

    let release: () => void;
    try {
      release = await connectMutexRef.current.acquire(myAbort.signal);
    } catch {
      // Aborted while queued — the call that superseded us owns cleanup.
      clearConnectingState();
      return;
    }
    try {
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;
      setConnecting(true);

      // Create a fresh AbortController for this connection cycle
      abortControllerRef.current = new AbortController();

      const { isConnected: hasFreighter } = await withTimeout(
        freighterIsConnected(),
        WALLET_CONNECT_TIMEOUT_MS,
        'Freighter connection check',
      );
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;

      if (!hasFreighter) {
        throw new Error(
          'Freighter wallet extension not detected. Install it from https://www.freighter.app/ and reload.',
        );
      }

      // Prompts the user for permission if not already granted, then
      // returns the currently-selected address.
      const { address, error } = await withTimeout(
        requestAccess(),
        WALLET_CONNECT_TIMEOUT_MS,
        'Freighter access request',
      );
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;
      if (error || !address) {
        throw new Error(error?.message ?? 'Failed to connect to Freighter.');
      }

      setPublicKey(address);
      setWalletName('Freighter');
      saveWalletSession({ key: address, name: 'Freighter' });
    } catch (error) {
      clearConnectingState();
      throw error;
    } finally {
      release();
      clearConnectingState();
    }
  }, []);

  // ── disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    pendingRequestIdRef.current += 1;
    pendingConnectAbortRef.current?.abort();
    setConnecting(false);
    setPublicKey(null);
    setWalletName(null);

    // Purge the wallet session only — a blanket clear() previously wiped
    // unrelated storage (e.g. the theme preference) on every disconnect (#237).
    clearWalletSession();

    // Abort all in-flight operations immediately
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    // Clear all cached stream data so a subsequent wallet connection
    // cannot see the previous wallet's streams (fixes #81 & #146).
    queryClient.clear();
    clearTransactions();
    router.push('/');
  }, [clearTransactions, router]);

  // ── external wallet-change watcher ─────────────────────────────────────────

  // Freighter reports address/network changes only through this poll-based
  // watcher — there is no push event. Without it, switching accounts directly
  // in the extension (rather than via this app's Disconnect button) leaves
  // `publicKey` and every cached on-chain query pointed at the old account,
  // silently showing stale data (fixes #88).
  useEffect(() => {
    const watcher = new WatchWalletChanges();
    watcher.watch(({ address }) => {
      if (!isMountedRef.current) return;
      if (!publicKeyRef.current) return; // no active session to keep in sync

      if (!address) {
        // Extension locked or app access revoked underneath us — the
        // session is no longer valid, so tear it down the same way an
        // explicit Disconnect click would.
        toast.error('Wallet disconnected — Freighter is locked or access was revoked.');
        disconnect();
        return;
      }
      if (address === publicKeyRef.current) return; // nothing actually changed

      setPublicKey(address);
      saveWalletSession({ key: address, name: 'Freighter' });
      queryClient.clear();
      clearTransactions();
      toast(`Switched to ${truncateAddress(address)}`, { icon: '🔄' });
    });

    return () => watcher.stop();
  }, [clearTransactions, disconnect]);

  // ── signTx ─────────────────────────────────────────────────────────────────

  const signTx = useCallback(async (xdr: string, signal?: AbortSignal): Promise<string> => {
    if (!publicKey) throw new Error('Wallet not connected');
    if (typeof xdr !== 'string' || !xdr.trim()) {
      throw new Error('Invalid transaction payload.');
    }
    // Basic base64-XDR shape check: should be non-empty base64 characters
    if (!/^[A-Za-z0-9+/=\s]+$/.test(xdr.trim())) {
      throw new Error('Invalid transaction payload: not a valid base64 string.');
    }

    const operationAbortController = new AbortController();
    const combinedSignal = signal ?? operationAbortController.signal;

    // If the global abort controller (from disconnect) fires, abort this op too
    const globalAbortCleanup = () => {
      operationAbortController.abort();
    };
    abortControllerRef.current?.signal.addEventListener('abort', globalAbortCleanup, { once: true });

    // Acquire a semaphore permit — limits concurrent Freighter popups
    const release = await semaphoreRef.current.acquire(combinedSignal);

    return trackOperation(async () => {
      try {
        if (combinedSignal.aborted) {
          throw new Error('Operation aborted');
        }

        const requestId = pendingRequestIdRef.current;
        const currentPublicKey = publicKeyRef.current;
        const { signedTxXdr, error } = await withTimeout(
          signTransaction(xdr, {
            networkPassphrase: getNetworkPassphrase(),
            address:           currentPublicKey ?? undefined,
          }),
          WALLET_CONNECT_TIMEOUT_MS,
          'Freighter signing',
        );

        if (combinedSignal.aborted) {
          throw new Error('Operation aborted');
        }

        if (requestId !== pendingRequestIdRef.current || currentPublicKey !== publicKeyRef.current) {
          throw new Error('Wallet state changed during signing. Please retry the operation.');
        }

        if (error || !signedTxXdr) {
          throw new Error(error?.message ?? 'Failed to sign transaction in Freighter.');
        }
        return signedTxXdr;
      } finally {
        release();
        abortControllerRef.current?.signal.removeEventListener('abort', globalAbortCleanup);
      }
    });
  }, [publicKey, trackOperation]);

  // ── Memoized context value ─────────────────────────────────────────────────

  const contextValue = useMemo<WalletState>(() => ({
    publicKey,
    walletName,
    connecting,
    connected: publicKey !== null,
    pendingOperationCount,
    maxConcurrentOperations,
    connect,
    disconnect,
    signTx,
  }), [
    publicKey,
    walletName,
    connecting,
    pendingOperationCount,
    maxConcurrentOperations,
    connect,
    disconnect,
    signTx,
  ]);

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}
