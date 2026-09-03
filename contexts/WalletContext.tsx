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
  getNetwork,
  requestAccess,
  signTransaction,
  WatchWalletChanges,
} from '@stellar/freighter-api';
import { getNetworkPassphrase } from '@/lib/env';
import { withTimeout } from '@/lib/with-timeout';
import { queryClient } from '@/lib/queryClient';
import { resetTokenAllowanceGateway } from '@/lib/token-allowance-gateway';
import { useTransactionStore } from '@/lib/store';
import { truncateAddress } from '@/lib/format';
import { useRouter } from 'next/navigation';
import {
  clearWalletSession,
  loadWalletSession,
  saveWalletSession,
  touchWalletSession,
} from '@/lib/wallet-storage';
import { resetServer, resetCircuitBreaker } from '@/lib/soroban';
import { clearIdempotencyKeys } from '@/lib/safe-operations';
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
      // Fast path: nothing holds the lock.
      if (!this._locked) {
        this._locked = true;
        resolve(this._makeRelease());
        return;
      }

      // Slow path: queue, and clean up the abort listener on either outcome
      // so a completed acquire doesn't leave a dead listener on a long-lived
      // AbortSignal (#390).
      let onAbort: (() => void) | undefined;
      const cleanup = () => {
        if (onAbort && abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
          onAbort = undefined;
        }
      };

      const entry = (release: () => void) => {
        cleanup();
        if (abortSignal?.aborted) {
          // `_release()` has already dequeued this waiter and handed the lock
          // over to it, so rejecting without releasing strands the lock
          // forever and deadlocks every later connect() (#389). Pass it on.
          release();
          reject(new Error('Operation aborted'));
          return;
        }
        resolve(release);
      };

      // A signal that is already aborted never fires an 'abort' event, so the
      // listener below would never run and this waiter would sit in the queue
      // until `_release()` handed it the lock — the same leak, reached from
      // the other side (#389). Reject before queueing instead.
      if (abortSignal?.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }
      this._queue.push(entry);

      if (abortSignal) {
        onAbort = () => {
          const idx = this._queue.indexOf(entry);
          if (idx !== -1) this._queue.splice(idx, 1);
          cleanup();
          reject(new Error('Operation aborted'));
        };
        abortSignal.addEventListener('abort', onAbort);
      }
    });
  }

  /**
   * Build a one-shot release function. Calling it more than once is a no-op,
   * so a `finally { release() }` plus an explicit or retried call can't hand
   * the lock to two waiters (#388).
   */
  private _makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this._release();
    };
  }

  private _release() {
    const next = this._queue.shift();
    if (next) {
      next(this._makeRelease());
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
      return this._makeRelease();
    }

    return new Promise<() => void>((resolve, reject) => {
      let onAbort: (() => void) | undefined;
      const cleanup = () => {
        if (onAbort && signal) {
          signal.removeEventListener('abort', onAbort);
          onAbort = undefined;
        }
      };

      const entry = {
        resolver: (release: () => void) => {
          cleanup();
          if (signal?.aborted) {
            // `_release()` has already dequeued this waiter and handed the
            // permit to it without incrementing `_available`. Rejecting
            // without releasing loses the permit permanently, and after
            // `maxConcurrentOperations` of these the semaphore is exhausted
            // and every signTx hangs forever (#389). Pass it on instead.
            release();
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
        onAbort = () => {
          this._dequeue(entry);
          cleanup();
          reject(new Error('Operation aborted'));
        };
        signal.addEventListener('abort', onAbort);
      }
    });
  }

  private _dequeue(entry: typeof this._queue[0]) {
    const idx = this._queue.indexOf(entry);
    if (idx !== -1) this._queue.splice(idx, 1);
  }

  /**
   * Build a one-shot release function. A second call is a no-op, so a double
   * `release()` can't over-increment `_available` past `maxConcurrent` (#388).
   */
  private _makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this._release();
    };
  }

  private _release() {
    const next = this._queue.shift();
    if (next) {
      next.resolver(this._makeRelease());
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

/**
 * Timeout message for wallet calls. This one reaches the user directly
 * (ConnectButton renders it), so it stays wallet-specific rather than using
 * the shared helper's default `… timed out after 15000ms` (#393).
 */
function walletTimeoutError(ms: number, label?: string): Error {
  return new Error(
    `${label ?? 'Wallet operation'} timed out after ${ms / 1000}s — the wallet or network may be unresponsive.`,
  );
}

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
      // A returning user with a still-valid session is active — slide the
      // expiry so an open tab isn't force-disconnected 24h after the first
      // connect (#430).
      touchWalletSession();
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
        { label: 'Freighter connection check', onTimeout: walletTimeoutError },
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
        { label: 'Freighter access request', onTimeout: walletTimeoutError },
      );
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;
      if (error || !address) {
        throw new Error(error?.message ?? 'Failed to connect to Freighter.');
      }

      // Verify the wallet's network matches the app's configured network
      // before completing the connection (#418).
      const { networkPassphrase: walletPassphrase, error: networkError } = await withTimeout(
        getNetwork(),
        WALLET_CONNECT_TIMEOUT_MS,
        { label: 'Freighter network check', onTimeout: walletTimeoutError },
      );
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;
      if (networkError) {
        throw new Error(networkError.message ?? 'Failed to read wallet network.');
      }

      const configuredPassphrase = getNetworkPassphrase();
      if (walletPassphrase && walletPassphrase !== configuredPassphrase) {
        throw new Error(
          `Network mismatch: your wallet is set to "${walletPassphrase}" but the app expects "${configuredPassphrase}". Please switch your wallet to the correct network and try again.`,
        );
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
    resetTokenAllowanceGateway();
    clearTransactions();
    resetServer();
    resetCircuitBreaker();
    resetTokenAllowanceGateway();
    clearIdempotencyKeys();
    router.push('/');
  }, [clearTransactions, router]);

  // ── external wallet-change watcher ─────────────────────────────────────────

  // Freighter reports address/network changes only through this poll-based
  // watcher — there is no push event. Without it, switching accounts directly
  // in the extension (rather than via this app's Disconnect button) leaves
  // `publicKey` and every cached on-chain query pointed at the old account,
  // silently showing stale data (fixes #88).
  useEffect(() => {
    // `WatchWalletChanges.stop()` only flips an internal flag; a poll
    // iteration already awaiting Freighter when we call it still runs to
    // completion and fires this callback one last time (and schedules one
    // more `setTimeout` we cannot clear from out here). `active` is a
    // per-effect-instance latch so that trailing tick — and any tick after
    // an unmount or a dependency-triggered re-subscribe — is ignored instead
    // of mutating state on a torn-down tree.
    let active = true;
    const watcher = new WatchWalletChanges();
    watcher.watch(({ address, networkPassphrase }) => {
      if (!active || !isMountedRef.current) return;
      if (!publicKeyRef.current) return; // no active session to keep in sync

      if (!address) {
        // Extension locked or app access revoked underneath us — the
        // session is no longer valid, so tear it down the same way an
        // explicit Disconnect click would.
        toast.error('Wallet disconnected — Freighter is locked or access was revoked.');
        disconnect();
        return;
      }

      // Check for network change: if the wallet's network passphrase no
      // longer matches the app's configured network, clear stale data and
      // warn the user. This handles Freighter testnet<->mainnet switches
      // that leave React Query caches pointing at the wrong network (#418).
      const configuredPassphrase = getNetworkPassphrase();
      if (networkPassphrase && networkPassphrase !== configuredPassphrase) {
        queryClient.clear();
        resetTokenAllowanceGateway();
        clearTransactions();
        resetServer();
        resetCircuitBreaker();
        clearIdempotencyKeys();
        toast.error(
          `Network mismatch: wallet is on a different network (${networkPassphrase}) than the app (${configuredPassphrase}). Please switch your wallet to the correct network.`,
        );
        return;
      }

      if (address === publicKeyRef.current) return; // nothing actually changed

      setPublicKey(address);
      saveWalletSession({ key: address, name: 'Freighter' });
      queryClient.clear();
      resetTokenAllowanceGateway();
      clearTransactions();
      resetServer();
      resetCircuitBreaker();
      resetTokenAllowanceGateway();
      clearIdempotencyKeys();
      toast(`Switched to ${truncateAddress(address)}`, { icon: '🔄' });
    });

    return () => {
      active = false;
      watcher.stop();
    };
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
    const globalAbortSignal = abortControllerRef.current?.signal;
    globalAbortSignal?.addEventListener('abort', globalAbortCleanup, { once: true });

    try {
      // Acquire a semaphore permit — limits concurrent Freighter popups
      const release = await semaphoreRef.current.acquire(combinedSignal);

      return await trackOperation(async () => {
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
        }
      });
    } finally {
      globalAbortSignal?.removeEventListener('abort', globalAbortCleanup);
    }
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
