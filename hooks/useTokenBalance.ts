'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';

/** Token balance data stays fresh for 15 seconds before SWR revalidation. */
export const TOKEN_BALANCE_STALE_TIME_MS = 15_000;
/** Public alias for callers that want to configure the cache duration. */
export const BALANCE_CACHE_TTL_MS = TOKEN_BALANCE_STALE_TIME_MS;
/** Kept for compatibility with callers that used the old debounce name. */
export const BALANCE_DEBOUNCE_MS = TOKEN_BALANCE_STALE_TIME_MS;

export const tokenBalanceKey = (address: string, token: string) =>
  ['tokenBalance', address, token] as const;

interface BalanceCacheEntry {
  timestamp: number;
  promise: Promise<bigint>;
}

const balanceDebounceCache = new Map<string, BalanceCacheEntry>();

/**
 * Deduplicate rapid token balance queries within the SWR window (#749, #812).
 * Prevents redundant parallel RPC queries when multiple components mount simultaneously.
 */
export function getCachedTokenBalanceFetch(
  address: string,
  token: string,
  fetchFn: () => Promise<bigint>,
  ttlMs = TOKEN_BALANCE_STALE_TIME_MS,
): Promise<bigint> {
  const key = `${address}:${token}`;
  const now = Date.now();
  const existing = balanceDebounceCache.get(key);

  if (existing && now - existing.timestamp < ttlMs) {
    return existing.promise;
  }

  const promise = fetchFn().catch((err) => {
    // If the request fails, remove from cache so subsequent attempts can retry
    if (balanceDebounceCache.get(key)?.promise === promise) {
      balanceDebounceCache.delete(key);
    }
    throw err;
  });

  balanceDebounceCache.set(key, { timestamp: now, promise });
  return promise;
}

/** Test-only or on-invalidation cache clearance */
export function clearTokenBalanceCache(
  address?: string | null,
  token?: string | null,
): void {
  if (address && token) {
    balanceDebounceCache.delete(`${address}:${token}`);
  } else {
    balanceDebounceCache.clear();
  }
}

/**
 * Invalidate a token balance after a deposit (create stream / top-up) so the
 * displayed balance reflects the deducted funds immediately (#756, #812).
 */
export function invalidateTokenBalance(
  qc: QueryClient,
  address: string | null | undefined,
  token: string | null | undefined,
): Promise<void> {
  if (!address || !token) return Promise.resolve();
  clearTokenBalanceCache(address, token);
  return qc.invalidateQueries({ queryKey: tokenBalanceKey(address, token) });
}

export function useTokenBalance(
  address: string | null | undefined,
  token: string | null | undefined,
  fetchBalance: (address: string, token: string) => Promise<bigint>,
) {
  return useQuery({
    queryKey: tokenBalanceKey(address ?? '', token ?? ''),
    queryFn: () =>
      getCachedTokenBalanceFetch(address as string, token as string, () =>
        fetchBalance(address as string, token as string),
      ),
    enabled: !!address && !!token,
    staleTime: TOKEN_BALANCE_STALE_TIME_MS,
    gcTime: TOKEN_BALANCE_STALE_TIME_MS * 4,
  });
}

