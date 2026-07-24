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
} from '@stellar/freighter-api';
import { getNetworkPassphrase } from '@/lib/env';
import { queryClient } from '@/lib/queryClient';
import { useTransactionStore } from '@/lib/store';

// ── Concurrency Primitives ───────────────────────────────────────────────────

/**
 * A simple mutual-exclusion lock (binary semaphore).
 * Used to protect single-access resources like the Freighter popup.
 */
class Mutex {
  private _locked = false;
  private _queue: Array<(release: () => void) => void> = [];

  async acquire(abortSignal?: AbortSignal): Promise<() => void> {
    return new Promise<() => void>((resolve, reject) => {
      // If already locked, queue the request
      if (this._locked) {
        const entry = (release: () => void) => {
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

      if (abortSignal?.aborted) {
        reject(new Error('Operation aborted'));
      } else if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          // Remove this entry from queue if it hasn't been resolved yet
          const idx = this._queue.indexOf(entry!);
          if (idx !== -1) this._queue.splice(idx, 1);
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
class Semaphore {
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

  // Access the Zustand store's reset action outside of a component render
  const clearTransactions = useTransactionStore((s) => s.clearTransactions);

  // Restore previous session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('conduit:wallet');
    if (stored) {
      try {
        const { key, name } = JSON.parse(stored) as { key: string; name: string };
        if (typeof key === 'string' && key && typeof name === 'string' && name) {
          setPublicKey(key);
          setWalletName(name);
        } else {
          localStorage.removeItem('conduit:wallet');
        }
      } catch {
        localStorage.removeItem('conduit:wallet');
      }
    }

    return () => {
      isMountedRef.current = false;
      pendingRequestIdRef.current += 1;
      // Abort any in-flight operations
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── Operation tracking helper ──────────────────────────────────────────────

  function trackOperation<T>(fn: () => Promise<T>, _signal?: AbortSignal): Promise<T> {
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
    const release = await connectMutexRef.current.acquire();
    try {
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;
      setConnecting(true);

      // Create a fresh AbortController for this connection cycle
      abortControllerRef.current = new AbortController();

      const { isConnected: hasFreighter } = await freighterIsConnected();
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;

      if (!hasFreighter) {
        throw new Error(
          'Freighter wallet extension not detected. Install it from https://www.freighter.app/ and reload.',
        );
      }

      // Prompts the user for permission if not already granted, then
      // returns the currently-selected address.
      const { address, error } = await requestAccess();
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;
      if (error || !address) {
        throw new Error(error?.message ?? 'Failed to connect to Freighter.');
      }

      setPublicKey(address);
      setWalletName('Freighter');
      localStorage.setItem('conduit:wallet', JSON.stringify({ key: address, name: 'Freighter' }));
    } finally {
      release();
      if (requestId === pendingRequestIdRef.current && isMountedRef.current) {
        setConnecting(false);
      }
    }
  }, []);

  // ── disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    pendingRequestIdRef.current += 1;
    setConnecting(false);
    setPublicKey(null);
    setWalletName(null);
    localStorage.removeItem('conduit:wallet');

    // Abort all in-flight operations immediately
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    // Clear all cached stream data so a subsequent wallet connection
    // cannot see the previous wallet's streams (fixes #81).
    queryClient.clear();
    clearTransactions();
  }, [clearTransactions]);

  // ── signTx ─────────────────────────────────────────────────────────────────

  const signTx = useCallback(async (xdr: string, signal?: AbortSignal): Promise<string> => {
    if (!publicKey) throw new Error('Wallet not connected');
    if (typeof xdr !== 'string' || !xdr.trim()) {
      throw new Error('Invalid transaction payload.');
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
        const currentPublicKey = publicKey;
        const { signedTxXdr, error } = await signTransaction(xdr, {
          networkPassphrase: getNetworkPassphrase(),
          address:           currentPublicKey,
        });

        if (combinedSignal.aborted) {
          throw new Error('Operation aborted');
        }

        if (requestId !== pendingRequestIdRef.current || currentPublicKey !== publicKey) {
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
    }, combinedSignal);
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
