import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isLowReserve, useWalletBalance } from '../useWalletBalance';
import { invalidateTokenBalance, tokenBalanceKey, useTokenBalance } from '../useTokenBalance';

vi.mock('@/lib/env', () => ({ getHorizonUrl: () => 'https://horizon.test' }));

function wrapper(qc: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

afterEach(() => vi.unstubAllGlobals());

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
});
