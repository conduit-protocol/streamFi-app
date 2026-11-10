import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  CACHED_XLM_BALANCE_KEY,
  getCachedXlmBalance,
  isLowReserve,
  setCachedXlmBalance,
  useWalletBalance,
} from '../useWalletBalance';
import {
  BALANCE_CACHE_TTL_MS,
  BALANCE_DEBOUNCE_MS,
  clearTokenBalanceCache,
  getCachedTokenBalanceFetch,
  invalidateTokenBalance,
  tokenBalanceKey,
  useTokenBalance,
} from '../useTokenBalance';

describe('token balance SWR cache (#749)', () => {
  it('uses a fifteen-second cache window and deduplicates reads', async () => {
    expect(BALANCE_CACHE_TTL_MS).toBe(15_000);
    expect(BALANCE_DEBOUNCE_MS).toBe(15_000);
    const fetchBalance = vi.fn().mockResolvedValue(42n);
    await getCachedTokenBalanceFetch('GABC', 'CTOKEN', fetchBalance);
    await getCachedTokenBalanceFetch('GABC', 'CTOKEN', fetchBalance);
    expect(fetchBalance).toHaveBeenCalledTimes(1);
  });
});

vi.mock('@/lib/env', () => ({ getHorizonUrl: () => 'https://horizon.test' }));

function wrapper(qc: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

afterEach(() => {
  clearTokenBalanceCache();
  try {
    localStorage.removeItem(CACHED_XLM_BALANCE_KEY);
  } catch {
    /* storage unavailable in env */
  }
  vi.unstubAllGlobals();
});

describe('useWalletBalance low reserve (#757)', () => {
  it('flags balances below 2 XLM only', () => {
    expect(isLowReserve(1.99)).toBe(true);
    expect(isLowReserve(2)).toBe(false);
    expect(isLowReserve(null)).toBe(false);
  });

  it('exposes isLowReserve from the Horizon native balance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balances: [{ asset_type: 'native', balance: '1.5000000' }] }),
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useWalletBalance('GABC'), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.balance).toBe(1.5));
    expect(result.current.isLowReserve).toBe(true);
  });
});

describe('useWalletBalance localStorage cache (#813)', () => {
  it('reads and writes to cached_xlm_balance key in localStorage', () => {
    setCachedXlmBalance(42.5);
    expect(localStorage.getItem(CACHED_XLM_BALANCE_KEY)).toBe('42.5');
    expect(getCachedXlmBalance()).toBe(42.5);
  });

  it('returns null when cached_xlm_balance is missing or invalid', () => {
    localStorage.removeItem(CACHED_XLM_BALANCE_KEY);
    expect(getCachedXlmBalance()).toBeNull();

    localStorage.setItem(CACHED_XLM_BALANCE_KEY, 'not-a-number');
    expect(getCachedXlmBalance()).toBeNull();
  });

  it('provides cached balance instantly as initial state before fetch finishes', async () => {
    localStorage.setItem(CACHED_XLM_BALANCE_KEY, '12.34');

    // Deferred fetch promise so we can assert the instant initial render value
    let resolveFetch: (val: any) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    vi.stubGlobal('fetch', vi.fn().mockReturnValue(fetchPromise));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useWalletBalance('GABC'), { wrapper: wrapper(qc) });

    // Initial state is optimistic from localStorage without waiting for Horizon response
    expect(result.current.balance).toBe(12.34);
    expect(result.current.isLoading).toBe(false);

    // Now resolve the fresh fetch
    resolveFetch!({
      ok: true,
      status: 200,
      json: async () => ({ balances: [{ asset_type: 'native', balance: '20.0000000' }] }),
    });

    await waitFor(() => expect(result.current.balance).toBe(20));
    expect(localStorage.getItem(CACHED_XLM_BALANCE_KEY)).toBe('20');
  });
});

describe('useTokenBalance refetch after deposit (#756)', () => {
  it('refetches the balance when invalidated', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fetchBalance = vi.fn().mockResolvedValueOnce(100n).mockResolvedValueOnce(40n);
    const { result } = renderHook(() => useTokenBalance('GABC', 'CTOKEN', fetchBalance), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.data).toBe(100n));

    await invalidateTokenBalance(qc, 'GABC', 'CTOKEN');
    await waitFor(() => expect(result.current.data).toBe(40n));
    expect(fetchBalance).toHaveBeenCalledTimes(2);
  });

  it('uses the issue key shape and no-ops without address/token', async () => {
    expect(tokenBalanceKey('G', 'C')).toEqual(['tokenBalance', 'G', 'C']);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    await invalidateTokenBalance(qc, null, 'C');
    expect(spy).not.toHaveBeenCalled();
  });

  describe('debounce cache within 2000ms window (#812)', () => {
    it('deduplicates parallel balance queries for the same token within 2 seconds', async () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const fetchBalance = vi.fn().mockImplementation(async () => {
        return 500n;
      });

      // Render two hooks simultaneously as if two components mounted in parallel
      const hook1 = renderHook(() => useTokenBalance('GABC', 'CTOKEN', fetchBalance), {
        wrapper: wrapper(qc),
      });
      const hook2 = renderHook(() => useTokenBalance('GABC', 'CTOKEN', fetchBalance), {
        wrapper: wrapper(qc),
      });

      await waitFor(() => expect(hook1.result.current.data).toBe(500n));
      await waitFor(() => expect(hook2.result.current.data).toBe(500n));

      // Only one RPC fetch call should have been triggered
      expect(fetchBalance).toHaveBeenCalledTimes(1);
    });

    it('separates cache entries by address and token', async () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const fetchBalance = vi.fn().mockResolvedValue(100n);

      const hook1 = renderHook(() => useTokenBalance('GABC', 'TOKEN1', fetchBalance), {
        wrapper: wrapper(qc),
      });
      const hook2 = renderHook(() => useTokenBalance('GABC', 'TOKEN2', fetchBalance), {
        wrapper: wrapper(qc),
      });

      await waitFor(() => expect(hook1.result.current.data).toBe(100n));
      await waitFor(() => expect(hook2.result.current.data).toBe(100n));

      expect(fetchBalance).toHaveBeenCalledTimes(2);
    });

    it('refetches once the 2000ms debounce window expires', async () => {
      vi.useFakeTimers();
      try {
        const fetchFn = vi.fn().mockResolvedValue(250n);

        // First call
        const p1 = getCachedTokenBalanceFetch('GABC', 'CTOKEN', fetchFn);
        expect(fetchFn).toHaveBeenCalledTimes(1);
        await p1;

        // Call within 2000ms window returns cached promise
        vi.advanceTimersByTime(1000);
        const p2 = getCachedTokenBalanceFetch('GABC', 'CTOKEN', fetchFn);
        expect(fetchFn).toHaveBeenCalledTimes(1);
        await p2;

        // Advance beyond 2000ms
        vi.advanceTimersByTime(1001);
        const p3 = getCachedTokenBalanceFetch('GABC', 'CTOKEN', fetchFn);
        expect(fetchFn).toHaveBeenCalledTimes(2);
        await p3;
      } finally {
        vi.useRealTimers();
      }
    });

    it('removes rejected fetch from cache so retries can proceed', async () => {
      const failFetch = vi.fn().mockRejectedValueOnce(new Error('RPC failed')).mockResolvedValueOnce(300n);

      await expect(getCachedTokenBalanceFetch('GABC', 'CTOKEN', failFetch)).rejects.toThrow('RPC failed');

      // Subsequent call should retry and not return the cached rejected promise
      const result = await getCachedTokenBalanceFetch('GABC', 'CTOKEN', failFetch);
      expect(result).toBe(300n);
      expect(failFetch).toHaveBeenCalledTimes(2);
    });
  });
});
